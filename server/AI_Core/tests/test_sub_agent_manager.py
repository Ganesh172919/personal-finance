from threading import Event
from time import monotonic
from types import SimpleNamespace

import pytest

from agents.sub_agent_manager import SubAgentManager


def task(task_id="budget", agent="budget_planner", dependencies=None):
    return {"id": task_id, "assigned_agent": agent, "dependencies": dependencies or []}


def test_retries_agent_exceptions_then_returns_success_without_mutating_cached_output():
    calls = []
    cached = {"monthly_income": 5000}

    def analyze(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise RuntimeError("Temporary provider failure")
        return cached

    manager = SubAgentManager({"budget_planner": SimpleNamespace(create_budget_plan=analyze)})
    result = manager.execute_subtasks([task()], {})["budget"]
    assert len(calls) == 2
    assert result["status"] == "completed"
    assert result["agent"] == "budget_planner"
    assert cached == {"monthly_income": 5000}


def test_retries_error_dicts_and_marks_exhausted_budget():
    calls = []

    def analyze(**kwargs):
        calls.append(kwargs)
        return {"error": "Provider unavailable"}

    manager = SubAgentManager({"budget_planner": SimpleNamespace(create_budget_plan=analyze)}, max_retries=2)
    result = manager.execute_subtasks([task()], {})["budget"]
    assert len(calls) == 3
    assert result["status"] == "failed"
    assert result["retries_exhausted"] is True
    assert result["error"] == "Provider unavailable"


@pytest.mark.parametrize("parallel", [False, True])
def test_timeout_returns_without_waiting_for_single_or_parallel_agent(parallel):
    release = Event()
    calls = []

    def slow(**kwargs):
        calls.append(kwargs)
        release.wait(3)
        return {"value": "late"}

    manager = SubAgentManager({
        "budget_planner": SimpleNamespace(create_budget_plan=slow),
        "investment_advisor": SimpleNamespace(provide_advice=lambda **kwargs: {"value": "ready"}),
    # Allow thread startup/logging on busy CI hosts while still proving that
    # execute_subtasks returns well before the worker's three-second wait.
    }, subtask_timeout=0.25, max_retries=3)
    tasks = [task()]
    if parallel:
        tasks.append(task("invest", "investment_advisor"))
    started = monotonic()
    try:
        results = manager.execute_subtasks(tasks, {})
        assert monotonic() - started < 1
        assert results["budget"]["status"] == "timeout"
        assert len(calls) == 1  # Never duplicate a call that is still running.
        if parallel:
            assert results["invest"]["value"] == "ready"
        snapshot = dict(results["budget"])
    finally:
        release.set()
    assert results["budget"] == snapshot


def test_queued_tasks_fail_gracefully_when_all_worker_slots_time_out():
    release = Event()
    manager = SubAgentManager({
        "budget_planner": SimpleNamespace(create_budget_plan=lambda **kwargs: release.wait(3)),
    }, subtask_timeout=0.05)
    try:
        results = manager.execute_subtasks([task("first"), task("queued")], {}, max_workers=1)
        assert results["first"]["status"] == "timeout"
        assert results["queued"]["status"] == "timeout"
    finally:
        release.set()


def test_expired_call_does_not_retry_after_it_eventually_fails():
    release = Event()
    finished = Event()
    calls = []

    def slow(**kwargs):
        calls.append(kwargs)
        release.wait(3)
        raise RuntimeError("Late provider failure")

    manager = SubAgentManager({"budget_planner": SimpleNamespace(create_budget_plan=slow)}, subtask_timeout=0.05)
    original_run = manager._run_with_retry

    def track_completion(*args, **kwargs):
        try:
            return original_run(*args, **kwargs)
        finally:
            finished.set()

    manager._run_with_retry = track_completion
    try:
        assert manager.execute_subtasks([task()], {})["budget"]["status"] == "timeout"
    finally:
        release.set()
    assert finished.wait(1)
    assert len(calls) == 1


def test_failed_dependencies_do_not_run_but_independent_tasks_still_complete():
    calls = []
    manager = SubAgentManager({
        "budget_planner": SimpleNamespace(create_budget_plan=lambda **kwargs: calls.append(kwargs) or {"ok": True}),
    }, max_retries=0)
    results = manager.execute_subtasks([
        task("failed", "unavailable"), task("dependent", dependencies=["failed"]), task("independent"),
    ], {})
    assert results["dependent"]["status"] == "dependency_failed"
    assert results["independent"]["status"] == "completed"
    assert len(calls) == 1


def test_successful_dependencies_are_available_to_the_next_level():
    manager = SubAgentManager({
        "budget_planner": SimpleNamespace(create_budget_plan=lambda **kwargs: {"ok": True}),
    })
    results = manager.execute_subtasks([task("first"), task("next", dependencies=["first"])], {})
    assert all(result["status"] == "completed" for result in results.values())


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan")])
def test_rejects_unbounded_timeout_settings(timeout):
    with pytest.raises(ValueError):
        SubAgentManager({}, subtask_timeout=timeout)


@pytest.mark.parametrize("retries", [-1, 1.5, True])
def test_rejects_invalid_retry_budgets(retries):
    with pytest.raises(ValueError):
        SubAgentManager({}, max_retries=retries)


def test_subtask_caching_returns_cached_result_and_skips_worker_dispatch():
    from utils.response_cache import ResponseCache
    calls = []
    cache = ResponseCache(max_size=32, ttl_seconds=60)

    def plan(**kwargs):
        calls.append(kwargs)
        return {"plan": "50/30/20 rule", "savings_target": 1200}

    manager = SubAgentManager(
        {"budget_planner": SimpleNamespace(create_budget_plan=plan)},
        task_cache=cache,
    )

    profile = {"monthly_income": 6000, "expenses": 3000}

    # 1. First execution: cache miss, runs worker
    res1 = manager.execute_subtasks([task("t1", "budget_planner")], profile)["t1"]
    assert len(calls) == 1
    assert res1["status"] == "completed"
    assert res1.get("from_cache") is not True

    # 2. Second execution with identical profile: cache hit, zero worker calls
    res2 = manager.execute_subtasks([task("t1", "budget_planner")], profile)["t1"]
    assert len(calls) == 1
    assert res2["status"] == "completed"
    assert res2["from_cache"] is True
    assert res2["plan"] == "50/30/20 rule"
    assert res2["execution_trace"][0]["cacheHit"] is True

    # 3. Cache stats verification
    stats = manager.get_cache_stats()
    assert stats["enabled"] is True
    assert stats["hits"] == 1
    assert stats["misses"] == 1


def test_subtask_caching_differentiates_distinct_inputs():
    from utils.response_cache import ResponseCache
    calls = []
    cache = ResponseCache(max_size=32)

    def advise(**kwargs):
        calls.append(kwargs)
        return {"recommendation": f"Asset plan for income {kwargs['user_profile'].get('income')}"}

    manager = SubAgentManager(
        {"investment_advisor": SimpleNamespace(provide_advice=advise)},
        task_cache=cache,
    )

    res_a = manager.execute_subtasks([task("i1", "investment_advisor")], {"income": 5000})["i1"]
    res_b = manager.execute_subtasks([task("i2", "investment_advisor")], {"income": 10000})["i2"]

    assert len(calls) == 2
    assert "5000" in res_a["recommendation"]
    assert "10000" in res_b["recommendation"]


def test_subtask_caching_bypassed_when_use_cache_is_false():
    from utils.response_cache import ResponseCache
    calls = []
    cache = ResponseCache(max_size=32)

    manager = SubAgentManager(
        {"budget_planner": SimpleNamespace(create_budget_plan=lambda **kw: calls.append(kw) or {"val": 1})},
        task_cache=cache,
    )

    # First run populates cache
    manager.execute_subtasks([task()], {"income": 4000})
    assert len(calls) == 1

    # Second run with use_cache=False forces worker recomputation
    res = manager.execute_subtasks([task()], {"income": 4000}, use_cache=False)["budget"]
    assert len(calls) == 2
    assert res.get("from_cache") is not True


def test_subtask_caching_does_not_cache_errors():
    from utils.response_cache import ResponseCache
    calls = []
    cache = ResponseCache(max_size=32)

    def failing_agent(**kw):
        calls.append(kw)
        return {"error": "Temporary upstream failure"}

    manager = SubAgentManager(
        {"budget_planner": SimpleNamespace(create_budget_plan=failing_agent)},
        task_cache=cache,
        max_retries=0,
    )

    res1 = manager.execute_subtasks([task()], {})["budget"]
    assert res1["status"] == "failed"
    assert len(calls) == 1

    # Second run attempts again because errors are never cached
    res2 = manager.execute_subtasks([task()], {})["budget"]
    assert len(calls) == 2
    assert res2["status"] == "failed"


def test_subtask_caching_invalidates_by_agent_and_clears():
    from utils.response_cache import ResponseCache
    cache = ResponseCache(max_size=32)
    b_calls = []
    i_calls = []

    manager = SubAgentManager(
        {
            "budget_planner": SimpleNamespace(create_budget_plan=lambda **kw: b_calls.append(kw) or {"b": 1}),
            "investment_advisor": SimpleNamespace(provide_advice=lambda **kw: i_calls.append(kw) or {"i": 2}),
        },
        task_cache=cache,
    )

    # Populate both
    manager.execute_subtasks([task("b", "budget_planner")], {})
    manager.execute_subtasks([task("i", "investment_advisor")], {})
    assert len(b_calls) == 1
    assert len(i_calls) == 1

    # Invalidate budget_planner only
    manager.invalidate_agent_cache("budget_planner")

    manager.execute_subtasks([task("b", "budget_planner")], {})
    manager.execute_subtasks([task("i", "investment_advisor")], {})
    assert len(b_calls) == 2  # Recomputed
    assert len(i_calls) == 1  # Still cached

    # Clear everything
    manager.clear_cache()
    manager.execute_subtasks([task("i", "investment_advisor")], {})
    assert len(i_calls) == 2  # Recomputed


def test_cross_session_shared_cache_persistence():
    from utils.response_cache import ResponseCache
    shared_cross_session_cache = ResponseCache(max_size=64, ttl_seconds=300)
    calls = []

    # Session 1 from User A / Query 1
    session_1_manager = SubAgentManager(
        {"budget_planner": SimpleNamespace(create_budget_plan=lambda **kw: calls.append(kw) or {"plan": "balanced"})},
        task_cache=shared_cross_session_cache,
    )
    res_1 = session_1_manager.execute_subtasks([task("session_1_task", "budget_planner")], {"salary": 5000})["session_1_task"]
    assert len(calls) == 1
    assert res_1["status"] == "completed"

    # Session 2 from User A in new conversation session / Query 2 (re-instantiated manager)
    session_2_manager = SubAgentManager(
        {"budget_planner": SimpleNamespace(create_budget_plan=lambda **kw: calls.append(kw) or {"plan": "balanced"})},
        task_cache=shared_cross_session_cache,
    )
    res_2 = session_2_manager.execute_subtasks([task("session_2_task", "budget_planner")], {"salary": 5000})["session_2_task"]
    assert len(calls) == 1  # Cache hit from Session 1! Zero worker execution!
    assert res_2["status"] == "completed"
    assert res_2["from_cache"] is True
    assert res_2["subtask_id"] == "session_2_task"
