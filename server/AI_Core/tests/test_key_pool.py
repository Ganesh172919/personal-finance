"""
Tests for multi-key pool with health tracking, rotation, and circuit breaker.
"""

import os
import time
import pytest
from unittest.mock import patch

from utils.key_pool import (
    KeyPool,
    KeyPoolConfig,
    KeyStatus,
    KeyEntry,
    KeyHealth,
    get_key_pool,
    get_all_key_pools,
    reset_all_key_pools,
)


@pytest.fixture(autouse=True)
def reset_pools():
    """Reset global key pools before each test."""
    reset_all_key_pools()
    yield
    reset_all_key_pools()


@pytest.fixture
def mock_env_single_key(monkeypatch):
    """Mock environment with a single API key."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-single")
    monkeypatch.delenv("OPENROUTER_API_KEY_1", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY_2", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEYS", raising=False)


@pytest.fixture
def mock_env_multi_keys(monkeypatch):
    """Mock environment with multiple numbered API keys."""
    monkeypatch.setenv("OPENROUTER_API_KEY_1", "test-key-1")
    monkeypatch.setenv("OPENROUTER_API_KEY_2", "test-key-2")
    monkeypatch.setenv("OPENROUTER_API_KEY_3", "test-key-3")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEYS", raising=False)


@pytest.fixture
def mock_env_array_keys(monkeypatch):
    """Mock environment with comma-separated API keys."""
    monkeypatch.setenv("OPENROUTER_API_KEYS", "array-key-1,array-key-2,array-key-3")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY_1", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY_2", raising=False)


class TestKeyPoolDiscovery:
    """Tests for API key discovery from environment."""

    def test_discovers_single_key(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        count = pool.initialize()

        assert count == 1
        keys = pool.get_all_keys()
        assert len(keys) == 1
        assert keys[0].key == "test-key-single"
        assert keys[0].key_id == "openrouter_0"

    def test_discovers_numbered_keys(self, mock_env_multi_keys):
        pool = KeyPool("openrouter")
        count = pool.initialize()

        assert count == 3
        keys = pool.get_all_keys()
        key_values = sorted([k.key for k in keys])
        assert key_values == ["test-key-1", "test-key-2", "test-key-3"]

    def test_discovers_array_keys(self, mock_env_array_keys):
        pool = KeyPool("openrouter")
        count = pool.initialize()

        assert count == 3
        keys = pool.get_all_keys()
        key_values = sorted([k.key for k in keys])
        assert key_values == ["array-key-1", "array-key-2", "array-key-3"]

    def test_discovers_json_array_keys(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEYS", '["json-key-1", "json-key-2"]')
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.delenv("OPENROUTER_API_KEY_1", raising=False)

        pool = KeyPool("openrouter")
        count = pool.initialize()

        assert count == 2
        assert sorted([entry.key for entry in pool.get_all_keys()]) == ["json-key-1", "json-key-2"]

    def test_no_keys_available(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.delenv("OPENROUTER_API_KEY_1", raising=False)
        monkeypatch.delenv("OPENROUTER_API_KEYS", raising=False)

        pool = KeyPool("openrouter")
        count = pool.initialize()

        assert count == 0
        assert pool.get_healthy_key() is None


class TestKeyPoolRotation:
    """Tests for key rotation strategies."""

    def test_round_robin_rotation(self, mock_env_multi_keys):
        pool = KeyPool("openrouter", KeyPoolConfig(rotation_strategy="round_robin"))
        pool.initialize()

        # Get keys in sequence
        keys_used = []
        for _ in range(6):  # 2 full rotations
            key = pool.get_healthy_key()
            keys_used.append(key.key_id)
            pool.record_success(key.key_id)

        # Should rotate through all keys
        assert "openrouter_1" in keys_used
        assert "openrouter_2" in keys_used
        assert "openrouter_3" in keys_used
        # First 3 should be unique
        assert len(set(keys_used[:3])) == 3

    def test_least_used_rotation(self, mock_env_multi_keys):
        pool = KeyPool("openrouter", KeyPoolConfig(rotation_strategy="least_used"))
        pool.initialize()

        # Use key 1 multiple times
        key1 = pool.get_healthy_key()
        for _ in range(5):
            pool.record_success(key1.key_id)

        # Next key should be one of the unused ones
        next_key = pool.get_healthy_key()
        assert next_key.key_id != key1.key_id
        assert next_key.health.total_requests == 0

    def test_health_weighted_rotation(self, mock_env_multi_keys):
        pool = KeyPool("openrouter", KeyPoolConfig(rotation_strategy="health_weighted"))
        pool.initialize()

        keys = pool.get_all_keys()

        # Degrade one key's health
        bad_key = keys[0]
        for _ in range(10):
            pool.record_failure(bad_key.key_id, status_code=500)

        # Good key should be preferred
        selected = pool.get_healthy_key()
        assert selected.key_id != bad_key.key_id


class TestKeyHealthTracking:
    """Tests for key health metrics and status."""

    def test_success_updates_metrics(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_success(key.key_id, latency_ms=150.0)

        health = key.health
        assert health.total_requests == 1
        assert health.successful_requests == 1
        assert health.failed_requests == 0
        assert health.success_rate == 100.0
        assert health.total_latency_ms == 150.0
        assert health.consecutive_failures == 0

    def test_failure_updates_metrics(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_failure(key.key_id, status_code=500)

        health = key.health
        assert health.total_requests == 1
        assert health.failed_requests == 1
        assert health.errors_5xx == 1
        assert health.consecutive_failures == 1

    def test_rate_limit_error_tracking(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_failure(key.key_id, status_code=429)

        health = key.health
        assert health.errors_429 == 1
        assert health.cooldown_until is not None
        assert health.cooldown_until > time.time()

    def test_access_denied_tracking(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_failure(key.key_id, status_code=403)

        health = key.health
        assert health.errors_403 == 1
        assert health.cooldown_until is not None


class TestCooldownBehavior:
    """Tests for key cooldown on errors."""

    def test_429_triggers_cooldown(self, mock_env_multi_keys):
        config = KeyPoolConfig(cooldown_429_seconds=60.0)
        pool = KeyPool("openrouter", config)
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_failure(key.key_id, status_code=429)

        # Key should be in cooldown
        status = key.get_status(config)
        assert status == KeyStatus.COOLDOWN

        # Pool should return a different key
        next_key = pool.get_healthy_key()
        assert next_key is not None
        assert next_key.key_id != key.key_id

    def test_cooldown_expires(self, mock_env_single_key):
        config = KeyPoolConfig(cooldown_429_seconds=0.1)  # 100ms cooldown
        pool = KeyPool("openrouter", config)
        pool.initialize()

        key = pool.get_healthy_key()
        pool.record_failure(key.key_id, status_code=429)

        # Should be in cooldown initially
        assert key.get_status(config) == KeyStatus.COOLDOWN

        # Wait for cooldown to expire
        time.sleep(0.15)

        # Should be healthy again
        assert key.get_status(config) in (KeyStatus.HEALTHY, KeyStatus.DEGRADED)


class TestCircuitBreaker:
    """Tests for circuit breaker behavior."""

    def test_circuit_opens_after_consecutive_failures(self, mock_env_single_key):
        config = KeyPoolConfig(circuit_failure_threshold=3)
        pool = KeyPool("openrouter", config)
        pool.initialize()

        key = pool.get_healthy_key()

        # Record failures below threshold
        pool.record_failure(key.key_id, status_code=500)
        pool.record_failure(key.key_id, status_code=500)
        assert key.get_status(config) != KeyStatus.CIRCUIT_OPEN

        # Third failure should open circuit (but 5xx also sets cooldown, which takes priority)
        pool.record_failure(key.key_id, status_code=500)
        # Circuit is open, but get_status returns COOLDOWN because cooldown is checked first
        assert key.health.circuit_opened_at is not None
        assert key.get_status(config) in (KeyStatus.CIRCUIT_OPEN, KeyStatus.COOLDOWN)

    def test_circuit_closes_on_success(self, mock_env_single_key):
        # Use very short cooldown for 5xx so it expires quickly
        config = KeyPoolConfig(
            circuit_failure_threshold=2,
            circuit_recovery_seconds=0.1,
            cooldown_5xx_seconds=0.1,  # Very short cooldown for test
        )
        pool = KeyPool("openrouter", config)
        pool.initialize()

        key = pool.get_healthy_key()

        # Open circuit (5xx also sets cooldown which may take precedence)
        pool.record_failure(key.key_id, status_code=500)
        pool.record_failure(key.key_id, status_code=500)
        assert key.health.circuit_opened_at is not None  # Circuit is open
        assert key.get_status(config) in (KeyStatus.CIRCUIT_OPEN, KeyStatus.COOLDOWN)

        # Wait for both circuit recovery AND cooldown to expire
        time.sleep(0.15)

        # Record success
        pool.record_success(key.key_id)
        assert key.health.circuit_opened_at is None
        assert key.get_status(config) in (KeyStatus.HEALTHY, KeyStatus.DEGRADED)

    def test_success_resets_consecutive_failures(self, mock_env_single_key):
        config = KeyPoolConfig(circuit_failure_threshold=5)
        pool = KeyPool("openrouter", config)
        pool.initialize()

        key = pool.get_healthy_key()

        # Some failures
        pool.record_failure(key.key_id, status_code=500)
        pool.record_failure(key.key_id, status_code=500)
        assert key.health.consecutive_failures == 2

        # Success resets
        pool.record_success(key.key_id)
        assert key.health.consecutive_failures == 0


class TestGlobalPoolManagement:
    """Tests for global pool registry."""

    def test_get_key_pool_creates_singleton(self, mock_env_single_key):
        pool1 = get_key_pool("openrouter")
        pool2 = get_key_pool("openrouter")

        assert pool1 is pool2

    def test_different_providers_have_different_pools(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
        monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")

        pool_or = get_key_pool("openrouter")
        pool_gemini = get_key_pool("gemini")

        assert pool_or is not pool_gemini
        assert pool_or.provider == "openrouter"
        assert pool_gemini.provider == "gemini"

    def test_get_all_key_pools(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
        monkeypatch.setenv("GROQ_API_KEY", "groq-key")

        get_key_pool("openrouter")
        get_key_pool("groq")

        all_pools = get_all_key_pools()
        assert "openrouter" in all_pools
        assert "groq" in all_pools

    def test_reset_all_key_pools(self, mock_env_single_key):
        pool = get_key_pool("openrouter")
        assert pool is not None

        reset_all_key_pools()
        all_pools = get_all_key_pools()
        assert len(all_pools) == 0


class TestKeyPoolStats:
    """Tests for pool statistics."""

    def test_stats_reflect_key_state(self, mock_env_multi_keys):
        pool = KeyPool("openrouter")
        pool.initialize()

        # Record some activity
        keys = pool.get_all_keys()
        pool.record_success(keys[0].key_id)
        pool.record_success(keys[0].key_id)
        pool.record_failure(keys[1].key_id, status_code=500)

        stats = pool.get_stats()

        assert stats["provider"] == "openrouter"
        assert stats["total_keys"] == 3
        assert stats["total_requests"] == 3
        assert stats["total_success"] == 2
        assert stats["overall_success_rate"] == pytest.approx(66.67, rel=0.1)

    def test_stats_count_key_statuses(self, mock_env_multi_keys):
        config = KeyPoolConfig(
            cooldown_429_seconds=60.0,
            circuit_failure_threshold=2,
        )
        pool = KeyPool("openrouter", config)
        pool.initialize()

        keys = pool.get_all_keys()

        # Put one key in cooldown
        pool.record_failure(keys[0].key_id, status_code=429)

        # Put one key in circuit open
        pool.record_failure(keys[1].key_id, status_code=500)
        pool.record_failure(keys[1].key_id, status_code=500)

        stats = pool.get_stats()

        # Note: 5xx errors also set cooldown, so the circuit-open key is also in cooldown
        # Stats count by get_status(), which checks cooldown before circuit_open
        assert stats["cooldown_keys"] == 2  # Both 429 and 5xx keys are in cooldown
        assert stats["circuit_open_keys"] == 0  # Circuit open is masked by cooldown status
        assert stats["healthy_keys"] == 1
        assert stats["available_keys"] == 1  # Only the healthy one


class TestKeyEntrySafeSerialization:
    """Tests for safe key entry serialization."""

    def test_to_safe_dict_hides_full_key(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-openrouter-very-long-api-key-12345")
        reset_all_key_pools()

        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_all_keys()[0]
        safe = key.to_safe_dict()

        assert "key" not in safe  # Full key not exposed
        assert "key_fingerprint" in safe
        assert safe["key_fingerprint"] != key.key
        assert len(safe["key_fingerprint"]) == 12

    def test_health_to_dict(self, mock_env_single_key):
        pool = KeyPool("openrouter")
        pool.initialize()

        key = pool.get_all_keys()[0]
        pool.record_success(key.key_id, latency_ms=100.0)
        pool.record_failure(key.key_id, status_code=429)

        health_dict = key.health.to_dict()

        assert "total_requests" in health_dict
        assert "success_rate" in health_dict
        assert "errors" in health_dict
        assert health_dict["errors"]["429"] == 1
