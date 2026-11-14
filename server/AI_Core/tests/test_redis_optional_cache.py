"""Redis-optional wrapper for agent_cache / subagent_task_cache (fake client, no redis package)."""

from __future__ import annotations

import fnmatch
import time

import pytest

from utils.llm_cache import cache_scope
from utils.redis_optional import RedisOptional
from utils.response_cache import RedisBackedResponseCache, ResponseCache, make_response_cache


class FakeRedis:
    def __init__(self):
        self.data = {}
        self.ttls = {}
        self.calls = 0

    def get(self, key):
        self.calls += 1
        return self.data.get(key)

    def set(self, key, value, ex=None):
        self.calls += 1
        self.data[key] = value
        self.ttls[key] = ex

    def delete(self, *keys):
        self.calls += 1
        return sum(1 for k in keys if self.data.pop(k, None) is not None)

    def scan_iter(self, match=None, count=None):
        self.calls += 1
        return iter([k for k in list(self.data) if fnmatch.fnmatchcase(k, match or "*")])


class DeadRedis(FakeRedis):
    def get(self, *args, **kwargs):
        self.calls += 1
        raise ConnectionError("down")

    set = delete = get


def _cache(client, **kw):
    return RedisBackedResponseCache(
        max_size=8, ttl_seconds=60, prefix="t", redis=RedisOptional(client_factory=lambda: client, **kw)
    )


def test_set_get_roundtrip_through_redis_and_tenant_namespacing():
    fake = FakeRedis()
    a = _cache(fake)
    with cache_scope("org-a"):
        a.set("k", {"x": 1})
    assert list(fake.data) == ["t:v1:org-a:k"]
    assert fake.ttls["t:v1:org-a:k"] == 60

    # A second replica (cold local LRU) sees org-a's value but org-b does not.
    b = _cache(fake)
    with cache_scope("org-b"):
        assert b.get("k") is None
    with cache_scope("org-a"):
        assert b.get("k") == {"x": 1}
        stats = b.get_stats()
        assert stats["hits"] == 1 and stats["misses"] == 1  # org-b miss + org-a promoted hit


def test_local_lru_hit_does_not_touch_redis():
    fake = FakeRedis()
    c = _cache(fake)
    c.set("k", {"x": 1})
    before = fake.calls
    assert c.get("k") == {"x": 1}
    assert fake.calls == before


def test_non_json_roundtrippable_values_stay_local():
    fake = FakeRedis()
    c = _cache(fake)
    c.set("tuple", {"a": (1, 2)})
    c.set("intkey", {1: "x"})
    c.set("obj", object())
    assert fake.data == {}
    assert c.get("tuple") == {"a": (1, 2)}


def test_dead_redis_degrades_to_local_and_short_circuits():
    dead = DeadRedis()
    c = _cache(dead, circuit_seconds=60)
    c.set("k", {"x": 1})  # redis fails, trips the circuit
    assert dead.calls == 1
    assert c.get("k") == {"x": 1}  # served locally
    assert c.get("missing") is None
    c.set("k2", 1)
    assert dead.calls == 1  # circuit open: no further Redis attempts
    assert c.get_stats()["redis"] is False


def test_circuit_closes_after_window():
    dead = DeadRedis()
    c = _cache(dead, circuit_seconds=0.01)
    c.set("k", 1)
    time.sleep(0.03)
    c.set("k2", 1)
    assert dead.calls == 2


def test_invalidate_pattern_and_clear_hit_redis():
    fake = FakeRedis()
    c = _cache(fake)
    with cache_scope("o"):
        c.set("subtask:budget:1", {"a": 1})
        c.set("subtask:budget:2", {"a": 2})
        c.set("subtask:debt:1", {"a": 3})
        assert c.invalidate_pattern("subtask:budget:") == 2
        assert set(fake.data) == {"t:v1:o:subtask:debt:1"}
        assert c.invalidate("subtask:debt:1") is True
        c.set("z", 1)
        c.clear()
    assert fake.data == {}


def test_missing_redis_package_is_disabled_not_fatal(monkeypatch):
    monkeypatch.setitem(__import__("sys").modules, "redis", None)  # import raises ImportError
    c = RedisBackedResponseCache(max_size=4, ttl_seconds=10, prefix="t", redis=RedisOptional(url="redis://nowhere:1"))
    c.set("k", {"v": 1})
    assert c.get("k") == {"v": 1}


def test_factory_picks_class_from_env(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert type(make_response_cache(4, 10)) is ResponseCache
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    assert isinstance(make_response_cache(4, 10), RedisBackedResponseCache)


def test_singletons_are_response_caches():
    from utils.response_cache import agent_cache

    assert isinstance(agent_cache, ResponseCache)
    with pytest.raises(ValueError):
        ResponseCache(max_size=0)
