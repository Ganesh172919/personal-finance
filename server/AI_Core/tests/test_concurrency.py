import asyncio
import threading

import pytest
from fastapi import HTTPException

from utils.concurrency import WorkGate


def test_gate_sheds_when_full_and_recovers():
    g = WorkGate(max_inflight=2, retry_after_seconds=3)
    g.claim()
    g.claim()
    with pytest.raises(HTTPException) as exc:
        g.claim()
    assert exc.value.status_code == 503
    assert exc.value.headers["Retry-After"] == "3"
    g.release()
    g.claim()
    assert g.stats()["shed_total"] == 1
    assert g.inflight == 2


def test_release_never_goes_negative():
    g = WorkGate(max_inflight=1)
    g.release()
    assert g.inflight == 0


def test_run_offloads_and_releases_on_error():
    g = WorkGate(max_inflight=1)
    main = threading.get_ident()

    async def go():
        assert await g.run(threading.get_ident) != main
        with pytest.raises(ValueError):
            await g.run(lambda: (_ for _ in ()).throw(ValueError("x")))
        assert g.inflight == 0

    asyncio.run(go())


def test_event_loop_stays_responsive_during_blocking_work():
    g = WorkGate(max_inflight=1)
    block = threading.Event()

    async def go():
        task = asyncio.create_task(g.run(block.wait, 2))
        await asyncio.sleep(0.05)
        ticks = 0
        for _ in range(5):
            await asyncio.sleep(0.01)
            ticks += 1
        block.set()
        await task
        return ticks

    assert asyncio.run(go()) == 5


def test_slot_context_manager_releases():
    g = WorkGate(max_inflight=1)

    async def go():
        async with g.slot():
            assert g.inflight == 1
            with pytest.raises(HTTPException):
                g.claim()
        assert g.inflight == 0

    asyncio.run(go())
