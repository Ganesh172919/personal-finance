"""
registry - versioned prompt / routing / exemplar artifacts (self-improvement loop, P3.2)

Agents call ``get_prompt`` / ``get_routing_config`` / ``get_exemplars``; an empty
database returns the baked-in defaults (byte-identical to pre-registry behaviour).
"""

from .context import (
    LearningContext,
    begin_context,
    clear_context,
    current_context,
    learning_context,
    record_cache_hit,
    record_fallback,
    record_llm_call,
    record_node,
    record_verification,
)
from .defaults import EXEMPLAR_KEYS, PROMPT_SPECS, SYNTHETIC_EXEMPLARS, render_prompt
from .loader import (
    get_exemplars,
    get_prompt,
    get_routing_config,
    invalidate,
    use_artifacts,
    use_defaults,
)
from .models import ExemplarSet, PromptArtifact, RoutingConfig

# Exports public artifact models, execution context managers, and loaders.
# Provides centralized access to prompt specifications and routing helpers.
# Exposes artifact lifecycle functions and cache invalidation utilities.
__all__ = [
    "EXEMPLAR_KEYS",
    "ExemplarSet",
    "LearningContext",
    "PROMPT_SPECS",
    "PromptArtifact",
    "RoutingConfig",
    "SYNTHETIC_EXEMPLARS",
    "begin_context",
    "clear_context",
    "current_context",
    "get_exemplars",
    "get_prompt",
    "get_routing_config",
    "invalidate",
    "learning_context",
    "record_cache_hit",
    "record_fallback",
    "record_llm_call",
    "record_node",
    "record_verification",
    "render_prompt",
    "use_artifacts",
    "use_defaults",
]
