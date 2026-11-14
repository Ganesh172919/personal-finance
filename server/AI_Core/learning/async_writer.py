"""
learning/async_writer.py - Bounded, non-blocking write buffer
=============================================================

Request threads must never wait on Mongo for learning data.  ``submit`` enqueues
``(collection, doc)`` on a bounded queue drained by one daemon thread; when the
queue is full the document is dropped (counted) rather than blocking the request.

When ``synchronous`` (tests, or no worker thread desired) writes happen inline.
``flush`` waits for the queue to drain.
"""

from __future__ import annotations

import logging
import queue
import threading
from typing import Any, Dict, Optional, Tuple

from utils.mongo_client import get_mongo_db, mongo_configured

from . import config

logger = logging.getLogger(__name__)

_Item = Tuple[str, Dict[str, Any]]


# Bounded asynchronous buffer draining learning analytics writes to Mongo.
# Uses background worker thread and queue to prevent blocking request cycles.
# Drops records gracefully when queue reaches maximum capacity threshold.
class AsyncWriter:
    # Initialises asynchronous queue buffer and write tracking statistics.
    # Configures queue capacity, worker thread locks, and drop metrics.
    # Accepts optional synchronous override for test or standalone modes.
    def __init__(self, maxsize: Optional[int] = None, synchronous: Optional[bool] = None):
        self._maxsize = maxsize or config.run_buffer_size()
        self._explicit_sync = synchronous
        self._queue: "queue.Queue[_Item]" = queue.Queue(maxsize=self._maxsize)
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self.dropped = 0
        self.written = 0
        self.failed = 0

    # Evaluates whether writes should execute synchronously without queueing.
    # Respects explicit synchronous override flag when explicitly supplied.
    # Automatically falls back to inline synchronous writes when Mongo is absent.
    @property
    def synchronous(self) -> bool:
        if self._explicit_sync is not None:
            return self._explicit_sync
        # No real Mongo configured (dev/tests): inline writes keep things deterministic.
        return not mongo_configured()

    # Enqueues database document write item into the asynchronous buffer.
    # Dispatches synchronously or writes non-blocking item to worker queue.
    # Increments drop counter and returns false if the write queue is full.
    def submit(self, collection: str, doc: Dict[str, Any]) -> bool:
        if self.synchronous:
            return self._write((collection, doc))
        self._ensure_thread()
        try:
            self._queue.put_nowait((collection, doc))
            return True
        except queue.Full:
            self.dropped += 1
            return False

    # Directly writes single document to targeted MongoDB collection.
    # Increments success metric or logs structured warning upon failure.
    # Traps connection exceptions without propagating failure upwards.
    def _write(self, item: _Item) -> bool:
        collection, doc = item
        try:
            get_mongo_db()[collection].insert_one(doc)
            self.written += 1
            return True
        except Exception as exc:
            self.failed += 1
            logger.warning(
                "learning_write_failed", extra={"event": "learning_write_failed", "collection": collection, "error": str(exc)[:200]}
            )
            return False

    # Guarantees that background writer daemon thread is active and running.
    # Uses double-checked locking pattern around worker thread creation.
    # Spawns dedicated daemon thread running queue consumer loop.
    def _ensure_thread(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._thread = threading.Thread(target=self._run, name="learning-writer", daemon=True)
            self._thread.start()

    # Continuous background loop consuming queued documents and persisting them.
    # Reads items from FIFO queue and delegates to internal write routine.
    # Signals task completion on queue to support graceful queue drain checks.
    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                self._write(item)
            finally:
                self._queue.task_done()

    # Blocks until all currently queued write operations have completed.
    # Returns immediately if in synchronous mode or no writer thread exists.
    # Uses synchronization event with timeout to await worker queue drain.
    def flush(self, timeout: float = 5.0) -> bool:
        if self.synchronous or self._thread is None:
            return True
        done = threading.Event()

        def _wait() -> None:
            self._queue.join()
            done.set()

        threading.Thread(target=_wait, daemon=True).start()
        return done.wait(timeout)

    # Summarises runtime queue sizes, success metrics, and failure counts.
    # Returns dictionary of pending queue size, written, dropped, and failed.
    # Serves as health reporting metric for asynchronous logging pipeline.
    def stats(self) -> Dict[str, int]:
        return {"queued": self._queue.qsize(), "written": self.written, "dropped": self.dropped, "failed": self.failed}


_writer: Optional[AsyncWriter] = None
_writer_lock = threading.Lock()


# Obtains singleton global instance of AsyncWriter for learning logging.
# Thread-safely initialises shared writer on first invocation.
# Provides central asynchronous writing hub for all application threads.
def get_writer() -> AsyncWriter:
    global _writer
    if _writer is None:
        with _writer_lock:
            if _writer is None:
                _writer = AsyncWriter()
    return _writer


# Resets global AsyncWriter singleton instance to uninitialized state.
# Locks shared mutex during reset to protect against concurrent access.
# Primarily utilized in automated test cleanup suites between runs.
def reset_writer() -> None:
    global _writer
    with _writer_lock:
        _writer = None
