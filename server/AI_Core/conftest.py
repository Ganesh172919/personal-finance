"""Keep in-process API tests independent of a developer's service-auth .env.

Unit tests set the middleware token explicitly instead of inheriting a real
developer secret. Protected-transport tests re-enable it with a synthetic token.
This fixture is loaded by pytest only, never by the running API.
"""

import os

import pytest

# Unit tests count upstream calls; a shared response cache would hide them.
# Cache behaviour has its own tests (tests/test_llm_cache.py) which opt in.
os.environ.setdefault("LLM_CACHE_ENABLED", "0")

# Never reach a real MongoDB from unit tests; parity tests inject mongomock explicitly.
os.environ.setdefault("AI_CORE_STATE_BACKEND", "sqlite")


# Fixture providing isolated internal authorization tokens during test execution.
# Overrides api_service internal token to keep tests deterministic and safe.
# Runs automatically across unit tests without requiring explicit test injection.
@pytest.fixture(autouse=True)
def isolated_internal_auth(monkeypatch):
    import api_service

    monkeypatch.setattr(api_service, "_INTERNAL_TOKEN", "")
