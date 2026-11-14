from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from threading import Barrier
from time import sleep
from types import SimpleNamespace

import pytest

from agents.sub_agent_manager import SubAgentManager
from contracts.trace import WorkflowTraceEntry
from utils.agent_execution import AgentExecution
from utils.agent_telemetry import get_agent_metrics
from utils.request_metrics import (
    begin_request_metrics,
    get_llm_call_count,
    get_llm_usage,
    get_request_id,
    record_llm_call,
    record_llm_usage,
)
from utils.response_cache import ResponseCache


def test_parallel_workers_preserve_request_context_and_report_their_actual_work_duration():
    begin_request_metrics("parallel-request")
    barrier = Barrier(2)

    def work(**kwargs):
        assert get_request_id() == "parallel-request"
        barrier.wait(2)
        record_llm_call()
        record_llm_usage(model="test", prompt_tokens=10, completion_tokens=5)
        sleep(0.02)
        return {"value": "done"}

    manager = SubAgentManager({"budget_planner": SimpleNamespace(create_budget_plan=work),
                               "investment_advisor": SimpleNamespace(provide_advice=work)})
    results = manager.execute_subtasks([
        {"id": "budget", "assigned_agent": "budget_planner"},
        {"id": "invest", "assigned_agent": "investment_advisor"},
    ], {})
    assert get_llm_call_count() == 2
    assert get_llm_usage()["total_tokens"] == 30
    for result in results.values():
        trace = result["execution_trace"][0]
        assert trace["latencyMs"] >= 15
        assert trace["llmCalls"] == 1
        assert trace["tokenCount"] == 15
        assert WorkflowTraceEntry.model_validate(trace).model_dump()["llmCalls"] == 1


def test_concurrent_requests_keep_usage_isolated():
    barrier = Barrier(2)

    def request(request_id, tokens):
        begin_request_metrics(request_id)

        def worker():
            barrier.wait(2)
            record_llm_call()
            record_llm_usage(model=request_id, prompt_tokens=tokens)

        with ThreadPoolExecutor(max_workers=1) as executor:
            executor.submit(copy_context().run, worker).result(timeout=3)
        return get_request_id(), get_llm_call_count(), get_llm_usage()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(request, "first", 10)
        second = executor.submit(request, "second", 25)
        a, b = first.result(), second.result()
    assert a == ("first", 1, {"tokens_in": 10, "tokens_out": 0, "total_tokens": 10, "cost_usd": 0.0, "models": ["first"]})
    assert b == ("second", 1, {"tokens_in": 25, "tokens_out": 0, "total_tokens": 25, "cost_usd": 0.0, "models": ["second"]})


def test_nested_measurements_do_not_double_count_usage_and_capture_cache_hits():
    begin_request_metrics("nested")
    cache = ResponseCache()
    cache.set("key", {"items": [1]})
    with AgentExecution("metrics_parent") as parent:
        with AgentExecution("metrics_child") as child:
            record_llm_call()
            record_llm_usage(model="test", total_tokens=7)
            cache.get("key")
            child.result = {"fallback_used": True}
    assert get_llm_call_count() == 1
    assert parent.trace["llmCalls"] == 0
    assert child.trace["llmCalls"] == 1
    assert child.trace["tokenCount"] == 7
    assert child.trace["fallbackUsed"] is True
    assert child.trace["cacheHit"] is True
    assert get_agent_metrics()["metrics_child"]["cache_hit_count"] == 1


def test_cache_values_cannot_be_mutated_by_another_agent():
    cache = ResponseCache()
    original = {"allocations": [{"amount": 100}]}
    cache.set("budget", original)
    original["allocations"][0]["amount"] = 0
    read = cache.get("budget")
    read["allocations"][0]["amount"] = 999
    assert cache.get("budget") == {"allocations": [{"amount": 100}]}


def test_cache_expiry_uses_monotonic_time(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("utils.response_cache.time.monotonic", lambda: clock[0])
    cache = ResponseCache(ttl_seconds=5)
    cache.set("budget", {"amount": 100})
    clock[0] = 104.0
    assert cache.get("budget") is not None
    clock[0] = 105.0
    assert cache.get("budget") is None


@pytest.mark.parametrize("size,ttl", [(0, 5), (1, -1)])
def test_cache_rejects_invalid_capacity_and_ttl(size, ttl):
    with pytest.raises(ValueError):
        ResponseCache(max_size=size, ttl_seconds=ttl)
