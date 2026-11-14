r"""
sub_agent_manager.py - Sub-Agent Pool Manager
===============================================

The ``SubAgentManager`` orchestrates the parallel execution of decomposed
subtasks.  It groups subtasks by dependency level using topological sort (Kahn's
algorithm), then runs each level concurrently via ``ThreadPoolExecutor`` -- the same
pattern used by ``_comprehensive_analysis_node`` in ``workflow.py``.

Key responsibilities
--------------------
- Topological sort of subtasks by their declared dependencies.
- Parallel execution of independent subtasks within each dependency level.
- Propagation of completed results to dependent subtasks.
- Graceful handling of partial failures (a failed subtask does not block
  unrelated subtasks).
- Fine-grained timeout control and retry budget per subtask.
- Telemetry and execution trace capturing for observability.

MINDMAP FLOW
------------
::

    SubAgentManager
    ├── 1. Initialization
    │   ├── Agent Registry Map (name -> agent instance)
    │   ├── Method Lookup Table (AGENT_METHOD_MAP)
    │   ├── Subtask Timeout Configuration (default 30s)
    │   └── Max Retry Budget (default 1 retry)
    ├── 2. Dependency Resolution (DAG)
    │   ├── Subtask Dependency Graph Construction
    │   ├── In-Degree & Dependent Mapping
    │   ├── Kahn's Topological Sort Leveling
    │   └── Cycle Detection & Final-Level Fallback
    ├── 3. Concurrency & Execution Pool
    │   ├── Level-by-Level Iterative Processing
    │   ├── Worker Capacity Clamping (min(max_workers, queued))
    │   ├── Non-blocking ThreadPoolExecutor Submission
    │   ├── Context Propagation (copy_context)
    │   └── Deadline & Cancellation Event Monitoring
    ├── 4. Subtask Execution & Retries
    │   ├── Input Building (_build_agent_kwargs)
    │   ├── Target Method Invocation (reflection)
    │   ├── AgentExecution Telemetry Context Tracking
    │   ├── Transient Error Retries up to max_retries
    │   └── Deadline Exceeded / Failure Record Generation
    └── 5. Result Aggregation & Output
        ├── Upstream Dependency Verification
        ├── Level Results Merge into Aggregated Dict
        ├── Execution Traces Injection
        └── Return to Workflow / Aggregator Engine

ASCII FLOW
----------
::

    +-------------------------------------------------------------+
    |                    Task Decomposer Output                   |
    |            [Subtask 1, Subtask 2, ..., Subtask N]           |
    +------------------------------+------------------------------+
                                   |
                                   v
    +-------------------------------------------------------------+
    |                 Kahn's Topological Sorting                  |
    |     - Calculate in-degrees for each subtask dependency      |
    |     - Group independent tasks into Levels: L0, L1, ..., Ln  |
    +------------------------------+------------------------------+
                                   |
                                   v
                   +---------------+---------------+
                   | Loop through each Level (L_i) |<-----------------+
                   +---------------+---------------+                  |
                                   |                                  |
                                   v                                  |
              +-----------------------------------------+             |
              | Verify Prior Dependencies for each task |             |
              +--------------------+--------------------+             |
                                   |                                  |
                    [Are dependencies satisfied?]                     |
                        /                     \                       |
                     YES                       NO                     |
                     /                           \                    |
                    v                             v                   |
     +------------------------------+   +---------------------------+ |
     | Enqueue into Active Level Q  |   | Mark Task 'dependency_    | |
     +--------------+---------------+   | failed' & record error    | |
                    |                   +---------------------------+ |
                    v                                                 |
     +------------------------------------------+                     |
     | ThreadPoolExecutor Worker Pool Execution |                     |
     |  - Submit workers with copy_context()    |                     |
     |  - Monitor deadlines & cancellation event|                     |
     +----------------------+-------------------+                     |
                            |                                         |
                            v                                         |
             +------------------------------+                         |
             | _run_with_retry:             |                         |
             |  - AgentExecution wrapper    |                         |
             |  - Dispatch to Agent method  |                         |
             |  - Retry on transient errors |                         |
             +--------------+---------------+                         |
                            |                                         |
              [Execution Success / Timeout?]                          |
                     /              \                                 |
                 SUCCESS          ERROR / TIMEOUT                     |
                   /                  \                               |
                  v                    v                              |
     +---------------------+   +-----------------------------+        |
     | Store task results  |   | Record timeout / error      |        |
     | & execution trace   |   | & partial execution trace   |        |
     +----------+----------+   +--------------+--------------+        |
                \                             /                       |
                 \                           /                        |
                  v                         v                         |
     +---------------------------------------------------+            |
     | Aggregate Level Results into Master Results Dict  |            |
     +--------------------------+------------------------+            |
                                |                                     |
               [Are there more levels in DAG?]                        |
                        /             \                               |
                      YES              NO                             |
                      /                 \                             |
        (Next Level) -+                  v                            |
                         +-------------------------------+            |
                         | Return Comprehensive Results  |            |
                         | Dict to Caller / Aggregator   |            |
                         +-------------------------------+            |

Design decisions
----------------
- Uses ``ThreadPoolExecutor`` (not async) to match the existing workflow
  pattern and avoid introducing async complexity.
- Each subtask is dispatched to its ``assigned_agent`` by name lookup
  in the agent registry dict.
- Partial failures are recorded in the result dict with an ``error`` key,
  matching the convention used by all specialist agents.
"""

import hashlib
import json
import logging
import math
import os
import threading
import time
from collections import defaultdict, deque
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextvars import copy_context
from copy import deepcopy
from datetime import datetime, timezone
from threading import Event
from typing import Any, Dict, List, Optional

from utils.agent_execution import AgentExecution
from utils.response_cache import ResponseCache, make_response_cache

# Shared cross-session task cache singleton for sub-agent DAG executions
subagent_task_cache = make_response_cache(max_size=512, ttl_seconds=600, prefix="subtask")

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared, bounded executor
# ---------------------------------------------------------------------------
# Python cannot kill a running thread.  The old design built a fresh
# ``ThreadPoolExecutor`` per dependency level and abandoned it on timeout, so
# every timeout leaked threads for as long as the (LLM) call ran.  One shared
# pool per process bounds the total thread count no matter how many requests
# time out; an expired call keeps its slot until it returns (LLM calls carry
# their own timeout) but can never grow the pool.
SUBAGENT_POOL_SIZE = max(1, int(os.getenv("SUBAGENT_POOL_SIZE", "16") or 16))
# Hard cap on parallel fan-out per dependency level, whatever the caller asks.
SUBAGENT_MAX_FANOUT = max(1, int(os.getenv("SUBAGENT_MAX_FANOUT", "4") or 4))

_shared_executor: Optional[ThreadPoolExecutor] = None
_shared_executor_lock = threading.Lock()


# Retrieves or initializes the shared bounded process thread pool executor.
# Reuses worker threads across DAG tasks to prevent thread pool exhaustion.
# Locks singleton construction to ensure thread-safe concurrent initialization.
def get_shared_executor() -> ThreadPoolExecutor:
    global _shared_executor
    if _shared_executor is None:
        with _shared_executor_lock:
            if _shared_executor is None:
                _shared_executor = ThreadPoolExecutor(
                    max_workers=SUBAGENT_POOL_SIZE, thread_name_prefix="subagent"
                )
    return _shared_executor


# Default retry budget configuration
DEFAULT_SUBTASK_TIMEOUT = 30  # seconds per subtask
DEFAULT_MAX_RETRIES = 1       # max retries per failed subtask


# Coordinates concurrent execution pipelines for decomposed advisor subtasks.
# Resolves dependency DAGs and enforces retry budgets and worker timeouts.
# Collects execution traces, metrics, and cached intermediate agent outputs.
class SubAgentManager:
    """Orchestrates parallel execution of decomposed subtasks.

    Parameters
    ----------
    agent_registry : dict
        Mapping of agent name (str) to agent instance.  Each agent must
        have an ``analyze`` / ``create`` / ``provide`` / ``optimize`` /
        ``explain`` method -- the manager dispatches based on the agent
        name using the ``AGENT_METHOD_MAP`` lookup.
    subtask_timeout : int
        Maximum seconds allowed per subtask before timeout (default 30).
    max_retries : int
        Maximum retry attempts for failed subtasks (default 1).
    """

    # Maps agent name -> (method name, positional args from profile/user_input).
    AGENT_METHOD_MAP: Dict[str, str] = {
        "income_expense_analyzer": "analyze_finances",
        "budget_planner": "create_budget_plan",
        "investment_advisor": "provide_advice",
        "debt_optimizer": "optimize_repayment",
        "financial_educator": "explain_concept",
    }

    # Initializes the sub-agent pool manager with agent registries and timeouts.
    # Configures per-subtask deadline limits and maximum retry failure allowances.
    # Connects shared cross-session cache instances for intermediate task reuse.
    def __init__(
        self,
        agent_registry: Dict[str, Any],
        subtask_timeout: float = DEFAULT_SUBTASK_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        task_cache: Optional[ResponseCache] = None,
    ):
        if not math.isfinite(subtask_timeout) or subtask_timeout <= 0:
            raise ValueError("subtask_timeout must be finite and positive")
        if not isinstance(max_retries, int) or isinstance(max_retries, bool) or max_retries < 0:
            raise ValueError("max_retries must be a non-negative integer")
        self.agent_registry = agent_registry
        self.subtask_timeout = subtask_timeout
        self.max_retries = max_retries
        self.task_cache = task_cache

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    # Executes decomposed subtasks in dependency order across topological levels.
    # Dispatches non-dependent subtasks concurrently within each topological tier.
    # Merges individual level outcomes and failure records into final results.
    def execute_subtasks(
        self,
        subtasks: List[Dict[str, Any]],
        user_profile: Dict[str, Any],
        user_input: str = "",
        max_workers: int = 4,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Execute subtasks in dependency order, running each level in parallel.

        Parameters
        ----------
        subtasks : list[dict]
            Subtask definitions from the TaskDecomposerAgent.  Each must
            have ``id``, ``assigned_agent``, and ``dependencies``.
        user_profile : dict
            The user's financial profile, passed to each agent.
        user_input : str
            The original user query (needed by financial_educator).
        max_workers : int
            Maximum parallel threads per dependency level.

        Returns
        -------
        dict
            Mapping of subtask_id -> agent output dict.  Failed subtasks
            have an ``error`` key in their value.
        """
        if not subtasks:
            return {}
        if not isinstance(max_workers, int) or isinstance(max_workers, bool) or max_workers < 1:
            raise ValueError("max_workers must be a positive integer")

        levels = self._topological_sort(subtasks)
        logger.info("Sub-agent pool: %d dependency levels, %d total subtasks", len(levels), len(subtasks))

        results: Dict[str, Any] = {}

        for level_idx, level_subtasks in enumerate(levels):
            logger.info("Executing dependency level %d: %s", level_idx, [s["id"] for s in level_subtasks])

            level_results = self._execute_level(
                level_subtasks, user_profile, user_input, results, max_workers, use_cache
            )
            results.update(level_results)

        return results

    # ------------------------------------------------------------------
    # Topological sort
    # ------------------------------------------------------------------

    # Groups subtasks into parallel execution levels using Kahn's algorithm.
    # Calculates in-degree dependency counts and builds directional edge graphs.
    # Detects circular dependency cycles and isolates remaining nodes safely.
    def _topological_sort(self, subtasks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Group subtasks into dependency levels using Kahn's algorithm.

        Returns a list of levels, where each level is a list of subtasks
        that can run in parallel.  Level 0 has no dependencies; level 1
        depends only on level 0; etc.
        """
        task_map = {s["id"]: s for s in subtasks}
        in_degree: Dict[str, int] = {s["id"]: 0 for s in subtasks}
        dependents: Dict[str, List[str]] = defaultdict(list)

        for subtask in subtasks:
            for dep_id in subtask.get("dependencies", []):
                if dep_id in task_map:
                    in_degree[subtask["id"]] += 1
                    dependents[dep_id].append(subtask["id"])

        # Seed the first level with zero-in-degree nodes.
        queue: deque = deque()
        for task_id, degree in in_degree.items():
            if degree == 0:
                queue.append(task_id)

        levels: List[List[Dict[str, Any]]] = []
        processed = 0

        while queue:
            level: List[Dict[str, Any]] = []
            level_size = len(queue)
            for _ in range(level_size):
                task_id = queue.popleft()
                level.append(task_map[task_id])
                processed += 1
                for dependent_id in dependents[task_id]:
                    in_degree[dependent_id] -= 1
                    if in_degree[dependent_id] == 0:
                        queue.append(dependent_id)
            if level:
                levels.append(level)

        # Handle cycles gracefully -- add remaining tasks as a final level.
        if processed < len(subtasks):
            remaining = [task_map[tid] for tid in task_map if tid not in {s["id"] for sl in levels for s in sl}]
            if remaining:
                logger.warning("Circular dependencies detected; forcing %d tasks into final level.", len(remaining))
                levels.append(remaining)

        return levels

    # ------------------------------------------------------------------
    # Level execution
    # ------------------------------------------------------------------

    # Executes all subtasks belonging to a single dependency level concurrently.
    # Checks dependency satisfaction and consults the task cache before queuing.
    # Manages thread pool capacity, execution deadlines, and timeout cancellations.
    def _execute_level(
        self,
        level_subtasks: List[Dict[str, Any]],
        user_profile: Dict[str, Any],
        user_input: str,
        prior_results: Dict[str, Any],
        max_workers: int,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Execute all subtasks in a single dependency level in parallel.

        The deadline covers all attempts for one subtask, starting when it
        is submitted to a free worker. Python cannot stop running threads:
        timed-out calls are not retried, and their slots are not reused.
        Remaining tasks fail gracefully if no worker capacity remains.
        """
        results: Dict[str, Any] = {}

        queued = deque()
        for subtask in level_subtasks:
            unavailable = [
                dep for dep in subtask.get("dependencies", [])
                if dep not in prior_results or prior_results[dep].get("error")
            ]
            if unavailable:
                results[subtask["id"]] = {
                    "error": f"Required subtasks unavailable: {', '.join(unavailable)}",
                    "subtask_id": subtask["id"],
                    "status": "dependency_failed",
                }
                continue

            # Check cross-session shared task cache if enabled
            if use_cache and self.task_cache is not None:
                cache_key = self._make_subtask_cache_key(subtask, user_profile, user_input, prior_results)
                cached = self.task_cache.get(cache_key)
                if cached is not None and not cached.get("error"):
                    logger.info("Subtask %s: cache hit (agent: %s)", subtask["id"], subtask.get("assigned_agent"))
                    cached_copy = deepcopy(cached)
                    cached_copy.update({
                        "from_cache": True,
                        "subtask_id": subtask["id"],
                        "agent": cached_copy.get("agent", subtask.get("assigned_agent")),
                        "status": "completed",
                        "execution_trace": [{
                            "agent": subtask.get("assigned_agent", "unknown"),
                            "startedAt": datetime.now(timezone.utc).isoformat(),
                            "endedAt": datetime.now(timezone.utc).isoformat(),
                            "status": "completed",
                            "cacheHit": True,
                            "latencyMs": 0.0,
                        }],
                    })
                    results[subtask["id"]] = cached_copy
                    continue

            queued.append(subtask)

        if not queued:
            return results

        capacity = min(max_workers, SUBAGENT_MAX_FANOUT, len(queued))
        executor = get_shared_executor()
        # future -> (subtask, submitted_at, started box, cancelled, iso start)
        pending: Dict[Any, Any] = {}

        def effective_deadline(entry: Any) -> float:
            # The deadline runs from when the task actually starts on a worker;
            # a task still waiting in the shared queue is bounded by the same
            # budget measured from submission.
            _, submitted_at, started, _, _ = entry
            return (started.get("at") or submitted_at) + self.subtask_timeout

        def run_timed(started: Dict[str, float], *args: Any) -> Dict[str, Any]:
            started["at"] = time.monotonic()
            return self._run_with_retry(*args)

        try:
            while queued or pending:
                while queued and len(pending) < capacity:
                    subtask = queued.popleft()
                    cancelled = Event()
                    started: Dict[str, float] = {}
                    future = executor.submit(
                        copy_context().run,
                        run_timed, started, subtask, user_profile, user_input, prior_results, cancelled,
                    )
                    pending[future] = (subtask, time.monotonic(), started, cancelled, datetime.now(timezone.utc).isoformat())

                if not pending:
                    # Every worker is still occupied by an expired call.
                    for subtask in queued:
                        results[subtask["id"]] = {
                            "error": "No worker available after subtask timeouts",
                            "subtask_id": subtask["id"],
                            "status": "timeout",
                        }
                    break

                remaining = max(0.0, min(effective_deadline(e) for e in pending.values()) - time.monotonic())
                # Cap the sleep so a task that starts late gets its deadline re-evaluated.
                done, _ = wait(pending, timeout=min(remaining, 0.25), return_when=FIRST_COMPLETED)
                for future in done:
                    subtask = pending.pop(future)[0]
                    task_res = future.result()
                    results[subtask["id"]] = task_res
                    if self.task_cache is not None and not task_res.get("error"):
                        cache_key = self._make_subtask_cache_key(subtask, user_profile, user_input, prior_results)
                        clean_to_cache = {k: v for k, v in task_res.items() if k not in ("execution_trace", "subtask_id")}
                        self.task_cache.set(cache_key, clean_to_cache)

                now = time.monotonic()
                for future, entry in list(pending.items()):
                    subtask, _, _, cancelled, started_at = entry
                    if now >= effective_deadline(entry):
                        subtask_id = subtask["id"]
                        pending.pop(future)
                        cancelled.set()
                        future.cancel()
                        capacity -= 1
                        logger.error("Subtask %s timed out after %ss", subtask_id, self.subtask_timeout)
                        results[subtask_id] = {
                            "error": f"Subtask timed out after {self.subtask_timeout}s",
                            "subtask_id": subtask_id,
                            "agent": subtask["assigned_agent"],
                            "status": "timeout",
                            "execution_trace": [{
                                "agent": subtask["assigned_agent"], "startedAt": started_at,
                                "endedAt": datetime.now(timezone.utc).isoformat(), "status": "error",
                                "error": "Subtask deadline exceeded", "latencyMs": self.subtask_timeout * 1000,
                            }],
                        }
        finally:
            # Never shut the shared pool down; just drop work that has not started.
            for future, entry in pending.items():
                entry[3].set()
                future.cancel()

        return results

    # Executes a subtask with retry resilience and telemetry trace capture.
    # Inspects cancellation flags between retries to honor global deadlines.
    # Emits detailed timing and error metrics on unrecoverable subtask failures.
    def _run_with_retry(
        self,
        subtask: Dict[str, Any],
        user_profile: Dict[str, Any],
        user_input: str,
        prior_results: Dict[str, Any],
        cancelled: Event | None = None,
    ) -> Dict[str, Any]:
        """Run a subtask with retry budget and timeout enforcement."""
        subtask_id = subtask.get("id", "unknown")
        last_error = None
        traces = []

        for attempt in range(1 + self.max_retries):
            if cancelled is not None and cancelled.is_set():
                return {"error": "Subtask deadline exceeded", "subtask_id": subtask_id, "status": "timeout"}
            try:
                execution = AgentExecution(subtask.get("assigned_agent", "unknown"))
                with execution:
                    result = self._run_single_subtask(subtask, user_profile, user_input, prior_results)
                    execution.result = result
                traces.append(execution.trace)
                if not result.get("error"):
                    return {**result, "execution_trace": traces}
                last_error = result["error"]
            except Exception as exc:
                last_error = exc
                traces.append(execution.trace)
            if attempt < self.max_retries:
                logger.warning(
                    "Subtask %s attempt %d/%d failed: %s. Retrying...",
                    subtask_id, attempt + 1, 1 + self.max_retries, last_error,
                )

        logger.error("Subtask %s exhausted %d attempts: %s", subtask_id, 1 + self.max_retries, last_error)
        return {
            "error": str(last_error),
            "agent": subtask.get("assigned_agent", "unknown"),
            "subtask_id": subtask_id,
            "status": "failed",
            "retries_exhausted": True,
            "execution_trace": traces,
        }

    # ------------------------------------------------------------------
    # Single subtask dispatch
    # ------------------------------------------------------------------

    # Dispatches a single subtask to its mapped specialist agent method.
    # Validates agent availability, extracts method handles, and binds inputs.
    # Returns structured task results tagged with agent identifiers and status.
    def _run_single_subtask(
        self,
        subtask: Dict[str, Any],
        user_profile: Dict[str, Any],
        user_input: str,
        prior_results: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Dispatch a single subtask to its assigned agent."""
        agent_name = subtask.get("assigned_agent", "")
        subtask_id = subtask.get("id", "unknown")

        agent = self.agent_registry.get(agent_name)
        if agent is None:
            logger.error("Agent %s not found in registry for subtask %s", agent_name, subtask_id)
            return {"error": f"Agent '{agent_name}' not available", "status": "failed"}

        method_name = self.AGENT_METHOD_MAP.get(agent_name)
        if method_name is None:
            logger.error("No method mapping for agent %s", agent_name)
            return {"error": f"No method mapping for agent '{agent_name}'", "status": "failed"}

        method = getattr(agent, method_name, None)
        if method is None:
            logger.error("Agent %s has no method %s", agent_name, method_name)
            return {"error": f"Agent '{agent_name}' missing method '{method_name}'", "status": "failed"}

        # Build kwargs based on what each agent method expects.
        kwargs = self._build_agent_kwargs(agent_name, user_profile, user_input, prior_results)

        try:
            logger.info("Subtask %s: dispatching to %s.%s", subtask_id, agent_name, method_name)
            result = method(**kwargs)
            if not isinstance(result, dict):
                raise TypeError(f"Agent '{agent_name}' returned a non-dictionary result")
            # Specialist results may come from a shared cache. Do not mutate them.
            return {
                **result,
                "agent": result.get("agent", agent_name),
                "subtask_id": subtask_id,
                "status": "failed" if result.get("error") else "completed",
            }
        except Exception as exc:
            logger.error("Subtask %s execution failed: %s", subtask_id, exc)
            return {"error": str(exc), "subtask_id": subtask_id, "status": "failed"}

    # Assembles specialized keyword arguments required by the target agent method.
    # Maps user profile, transactions, debts, or input prompts into parameters.
    # Incorporates prior dependent subtask results when needed by downstream agents.
    def _build_agent_kwargs(
        self,
        agent_name: str,
        user_profile: Dict[str, Any],
        user_input: str,
        prior_results: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build the keyword arguments for each agent's primary method."""
        if agent_name == "income_expense_analyzer":
            return {"transactions": user_profile.get("transactions", []), "currency_code": user_profile.get("currency")}
        elif agent_name == "budget_planner":
            return {"user_profile": user_profile}
        elif agent_name == "investment_advisor":
            return {"user_profile": user_profile}
        elif agent_name == "debt_optimizer":
            return {
                "debts": user_profile.get("debts", []),
                "user_profile": user_profile,
            }
        elif agent_name == "financial_educator":
            return {
                "user_input": user_input,
                "user_profile": user_profile,
            }
        else:
            return {"user_profile": user_profile}

    # Generates a deterministic SHA-256 cache key from subtask input arguments.
    # Serializes agent names, method arguments, and upstream dependency results.
    # Produces unique hex keys enabling cross-session subtask result caching.
    def _make_subtask_cache_key(
        self,
        subtask: Dict[str, Any],
        user_profile: Dict[str, Any],
        user_input: str,
        prior_results: Dict[str, Any],
    ) -> str:
        """Generate a deterministic cache key for a subtask based on its inputs and dependencies."""
        agent_name = subtask.get("assigned_agent", "unknown")
        kwargs = self._build_agent_kwargs(agent_name, user_profile, user_input, prior_results)

        dep_keys = subtask.get("dependencies", [])
        dep_data = {
            dep_id: prior_results[dep_id]
            for dep_id in dep_keys
            if dep_id in prior_results and not prior_results[dep_id].get("error")
        }

        payload = {
            "agent": agent_name,
            "kwargs": kwargs,
            "dependencies": dep_data,
        }
        serialized = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
        return f"subtask:{agent_name}:{digest}"

    # Retrieves hit rate, miss count, and memory statistics from the task cache.
    # Returns disabled status indicators if no task cache is currently configured.
    # Assists observability frameworks in monitoring task caching efficiency.
    def get_cache_stats(self) -> Dict[str, Any]:
        """Return task cache statistics."""
        if self.task_cache is None:
            return {"enabled": False}
        return {"enabled": True, **self.task_cache.get_stats()}

    # Evicts all cached subtask results stored in the underlying response cache.
    # Resets cache storage to force fresh evaluations during subsequent runs.
    # Ensures deterministic clearing during test runs or cache invalidation events.
    def clear_cache(self) -> None:
        """Clear all entries in the task cache."""
        if self.task_cache is not None:
            self.task_cache.clear()

    # Invalidates cached subtask outputs belonging to a specific agent namespace.
    # Matches subtask key prefixes corresponding to the designated specialist.
    # Returns the count of invalidated cache entries removed from memory.
    def invalidate_agent_cache(self, agent_name: str) -> int:
        """Invalidate all cached subtasks for a specific agent."""
        if self.task_cache is not None:
            return self.task_cache.invalidate_pattern(f"subtask:{agent_name}:")
        return 0
