"""
learning - the AI Core self-improvement loop (P3)
=================================================

Run store -> optimizer -> gate -> canary rollout -> promotion/rollback, plus the
model bandit and learned memory consolidation.  Submodules are imported lazily by
their users; importing this package has no side effects.

Safety invariant: the learner may only change non-numeric surfaces (prompts,
exemplars, routing thresholds, model choice, memory, cache TTL).  It never alters
numeric computation, the number-safety guard in ``utils/agent_helpers.py`` or tool
contracts.
"""

# Self-improvement loop package exporting offline learning submodules.
# Exposes run stores, optimizers, promotion gates, rollouts, and bandit systems.
# Provides cohesive namespace for AI learning and adaptive optimization components.
__all__ = [
    "async_writer",
    "bandit",
    "config",
    "gate",
    "memory_consolidation",
    "optimizer",
    "redact",
    "reports",
    "rollout",
    "run_store",
]
