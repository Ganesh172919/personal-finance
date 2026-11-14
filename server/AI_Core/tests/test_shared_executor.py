import threading

from agents.sub_agent_manager import get_shared_executor


def test_shared_executor_is_singleton_and_bounded():
    a, b = get_shared_executor(), get_shared_executor()
    assert a is b
    before = threading.active_count()
    futures = [a.submit(lambda: 1) for _ in range(200)]
    assert all(f.result(5) == 1 for f in futures)
    assert threading.active_count() - before <= a._max_workers
