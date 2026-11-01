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
