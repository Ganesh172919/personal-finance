"""Hermetic fixtures for the self-improvement loop tests (fresh in-memory Mongo per test)."""

import pytest


@pytest.fixture(autouse=True)
def _learning_env(monkeypatch, tmp_path):
    for name in ("AI_CORE_MONGO_URI", "MONGO_URI", "AI_PROMOTION_MODE", "LLM_BANDIT_ENABLED",
                 "AI_ROUTING_CANARY_AUTO", "AI_SHADOW_ENABLED", "AI_PLATFORM_ORG_IDS",
                 "AI_LEARNING_OPT_OUT_ORGS", "AI_OPTIMIZER_LLM_BUDGET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("AI_CORE_STATE_BACKEND", "memory")
    monkeypatch.setenv("LLM_CACHE_ENABLED", "0")
    monkeypatch.setenv("AI_REGISTRY_CACHE_TTL_SECONDS", "0")
    monkeypatch.setenv("AI_OPTIMIZER_MIN_FEEDBACK", "3")
    monkeypatch.setenv("AI_CANARY_MIN_SAMPLES", "6")
    monkeypatch.setenv("AI_EVAL_REPORT_DIR", str(tmp_path / "reports"))

    from learning import bandit, run_store
    from learning.async_writer import reset_writer
    from registry import loader, store
    from registry.context import clear_context
    from utils.mongo_client import reset_mongo_db

    def _reset() -> None:
        reset_mongo_db()
        run_store._indexed.clear()
        store._indexed_dbs.clear()
        loader.invalidate()
        reset_writer()
        bandit.reset()
        clear_context()

    _reset()
    yield
    _reset()
