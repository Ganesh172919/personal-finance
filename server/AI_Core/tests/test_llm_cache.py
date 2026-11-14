import threading
import time

import pytest
from langchain_core.messages import HumanMessage

from utils.llm_cache import LLMCache, cache_scope


def _key(cache, text, scope="org1", temperature=0.0):
    return cache.make_key(
        model_class="M", template_version="v1", messages=[HumanMessage(content=text)],
        temperature=temperature, scope=scope,
    )


def test_key_is_tenant_scoped_and_prompt_sensitive():
    c = LLMCache(redis_url="")
    assert _key(c, "hi", "orgA") != _key(c, "hi", "orgB")
    assert _key(c, "hi") != _key(c, "hello")
    assert _key(c, "hi") == _key(c, "hi")


def test_scope_contextvar_feeds_key():
    c = LLMCache(redis_url="")
    msgs = [HumanMessage(content="x")]
    with cache_scope("o1"):
        k1 = c.make_key(model_class="M", template_version="v1", messages=msgs, temperature=0)
    with cache_scope("o2"):
        k2 = c.make_key(model_class="M", template_version="v1", messages=msgs, temperature=0)
    assert k1 != k2


def test_temperature_gate():
    assert LLMCache.cacheable(0.0)
    assert LLMCache.cacheable(0.2)
    assert not LLMCache.cacheable(0.7)


def test_hit_after_miss_and_empty_not_cached():
    c = LLMCache(redis_url="")
    calls = []

    def compute():
        calls.append(1)
        return {"content": "answer"}

    k = _key(c, "q")
    assert c.get_or_compute(k, compute)[1] == "miss"
    payload, outcome = c.get_or_compute(k, compute)
    assert (payload["content"], outcome) == ("answer", "hit")
    assert len(calls) == 1

    k2 = _key(c, "empty")
    c.get_or_compute(k2, lambda: {"content": ""})
    assert c.get(k2) is None


def test_ttl_expiry():
    c = LLMCache(redis_url="", ttl_seconds=0.05)
    k = _key(c, "q")
    c.set(k, {"content": "x"})
    assert c.get(k) is not None
    time.sleep(0.1)
    assert c.get(k) is None


def test_lru_eviction():
    c = LLMCache(redis_url="", max_entries=2)
    keys = [_key(c, str(i)) for i in range(3)]
    for i, k in enumerate(keys):
        c.set(k, {"content": str(i)})
    assert c.get(keys[0]) is None
    assert c.get(keys[2]) is not None


def test_concurrent_identical_misses_coalesce():
    c = LLMCache(redis_url="")
    k = _key(c, "q")
    calls = []
    release = threading.Event()

    def compute():
        calls.append(1)
        release.wait(2)
        return {"content": "shared"}

    outcomes = []
    threads = [threading.Thread(target=lambda: outcomes.append(c.get_or_compute(k, compute)[1])) for _ in range(5)]
    for t in threads:
        t.start()
    time.sleep(0.2)
    release.set()
    for t in threads:
        t.join(5)
    assert len(calls) == 1
    assert sorted(outcomes).count("miss") == 1
    assert all(o in {"miss", "coalesced", "hit"} for o in outcomes)


def test_leader_failure_is_not_cached_and_followers_recompute():
    c = LLMCache(redis_url="")
    k = _key(c, "q")
    with pytest.raises(RuntimeError):
        c.get_or_compute(k, lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    assert c.get(k) is None
    assert c.get_or_compute(k, lambda: {"content": "ok"})[1] == "miss"


def test_dead_redis_degrades_to_lru():
    c = LLMCache(redis_url="redis://127.0.0.1:1/0")
    k = _key(c, "q")
    c.set(k, {"content": "x"})
    assert c.get(k) == {"content": "x"}
