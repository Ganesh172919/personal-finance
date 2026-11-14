r"""
rate_limiter.py - Token Bucket Rate Limiter and Retry Handler
==============================================================

Provides outbound request throttling for LLM API calls using a **token
bucket** algorithm with two time windows (per-minute and per-day).

================================================================================
MINDMAP FLOW: DUAL-WINDOW TOKEN BUCKET & RETRY CONTROLLER
================================================================================
- Rate Limiter & Resilience Architecture
    ├── 1. Dual-Window Token Buckets
    │   ├── Minute Bucket: Refilled continuously based on RPM (requests per min) + burst
    │   └── Day Bucket: Refilled across 24h / daily quota (requests per day)
    ├── 2. Concurrency & State Management
    │   ├── Mutual Exclusion Lock (threading.Lock)
    │   └── Request History Sliding Window (deque maxlen=1500)
    ├── 3. Adaptive Throttling & Wait Logic
    │   ├── Daily Exhaustion -> Immediate RateLimitError (no wait possible)
    │   └── Minute Exhaustion -> Proactive Sleep (wait_time = missing_tokens / rate)
    ├── 4. Intelligent Error Triaging & Retry Policy
    │   ├── Transient Errors (502, 503, ConnectTimeout, ReadTimeout)
    │   │   └── Exponential Backoff with Random Jitter
    │   └── Quota / Terminal Errors (429 Too Many Requests, 403 Auth, 404 Missing)
    │       └── Fail Fast! Do NOT retry locally; trigger upstream provider/key failover
    └── 5. Decorator Wrapper
        └── @with_rate_limit_and_retry transparent interception

================================================================================
ASCII FLOW: TOKEN BUCKET DEDUCTION & CALL LIFECYCLE
================================================================================
                         [ Outbound LLM API Request ]
                                      |
                                      v
                        +----------------------------+
                        |   Acquire Rate Limiter Lock|
                        +--------------+-------------+
                                      |
                                      v
                        +----------------------------+
                        |      _refill_tokens()      |
                        | Minute tokens += dt * RPM  |
                        | Day tokens += dt * RPD     |
                        +--------------+-------------+
                                      |
                         Is Day Bucket >= 1.0?
                                /       \
                            No /         \ Yes
                              v           v
           +--------------------+  Is Minute Bucket >= 1.0?
           | Raise              |        /           \
           | RateLimitError(day)|    No /             \ Yes
           +--------------------+      v               v
                               +---------------+  +------------------+
                               | Sleep for     |  | Deduct 1.0 token |
                               | required dt   |  | from both buckets|
                               +-------+-------+  +--------+---------+
                                       |                   |
                                       +--------->---------+
                                                           |
                                                           v
                                            +------------------------------+
                                            |   Execute LLM API Call       |
                                            +--------------+---------------+
                                                           |
                                             Did Request Succeed or Fail?
                                                    /            \
                                           Success /              \ Failure
                                                  v                v
                                          [ Return Result ]   Is Transient Error?
                                                             (Timeout, 502, 503)
                                                                 /         \
                                                            Yes /           \ No (429, 403, 404)
                                                               v             v
                                                     [ Backoff + Retry ] [ Raise / Failover ]

Key components
--------------
- ``TokenBucketRateLimiter`` -- thread-safe rate limiter that enforces
  requests-per-minute and requests-per-day quotas.  Tokens are refilled
  continuously based on elapsed time.
- ``RetryHandler`` -- determines whether a failed API call should be
  retried (transient errors like timeouts) or fail fast (429, 403, 404).
  Uses exponential backoff with jitter.
- ``with_rate_limit_and_retry`` -- decorator that wraps any function
  with rate limiting + retry logic.

Design decisions
----------------
- The default quotas (10 RPM, 1200 RPD) are conservative estimates for
  Gemini's free tier (15 RPM, 1500 RPD).
- 429 and 403 errors are **not retried** -- they trigger immediate
  failover to the next provider/key in the ``RateLimitedLLM`` wrapper.
- 404 errors are **not retried** -- they trigger model failover.
- Only transient errors (timeout, connection, 502, 503) are retried.
"""

import logging
import os
import random
import time
from collections import deque
from functools import wraps
from threading import Lock
from typing import Callable, Optional, TypeVar

logger = logging.getLogger(__name__)


# Parses floating-point number from environment variable with safe fallback.
# Handles missing values, empty strings, and numeric conversion exceptions.
# Returns parsed float value or designated default parameter.
def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


# Parses integer configuration value from environment variable safely.
# Converts string to float before integer truncation to handle decimal inputs.
# Returns parsed integer or specified default fallback on error.
def _env_int(name: str, default: int) -> int:
    try:
        return int(float(os.getenv(name, "") or default))
    except ValueError:
        return default


# Determines maximum allowable duration to wait for token bucket availability.
# Reads LLM_RATE_LIMIT_MAX_WAIT_SECONDS environment variable configuration.
# Returns non-negative wait duration in seconds defaulting to zero for fast fail.
def max_wait_seconds() -> float:
    """How long a request thread may wait for a token before failing fast.

    Defaults to 0: when the free-tier budget is exhausted the caller gets a
    ``RateLimitError`` immediately and the agent serves its deterministic
    fallback, instead of parking a worker thread for up to 30 s.  Set
    ``LLM_RATE_LIMIT_MAX_WAIT_SECONDS`` to trade latency for fewer fallbacks.
    """
    return max(0.0, _env_float("LLM_RATE_LIMIT_MAX_WAIT_SECONDS", 0.0))


# Constructs a configured TokenBucketRateLimiter instance from environment.
# Sets per-process minute quotas, daily caps, and burst allowances.
# Returns initialized TokenBucketRateLimiter configured for process workload.
def _build_rate_limiter() -> "TokenBucketRateLimiter":
    """Quotas are **per process**: set ``LLM_RPM`` to (provider RPM / workers)."""
    return TokenBucketRateLimiter(
        requests_per_minute=max(1, _env_int("LLM_RPM", 15)),
        requests_per_day=max(1, _env_int("LLM_RPD", 1500)),
        burst_allowance=max(0, _env_int("LLM_BURST", 3)),
    )

T = TypeVar('T')


# Exception raised when a request is blocked by local token bucket limiter.
# Conveys recommended retry-after delay duration for caller backoff.
# Signals exhaustion of current minute or daily request quota allowances.
class RateLimitError(Exception):
    """Raised when the local rate limiter blocks a request.

    Carries ``retry_after`` so callers know how long to wait.
    """
    # Initializes RateLimitError with descriptive message and retry delay.
    # Passes error message string to base Exception class constructor.
    # Stores numeric retry-after duration in seconds on exception instance.
    def __init__(self, message: str, retry_after: float = 60.0):
        super().__init__(message)
        self.retry_after = retry_after


# Thread-safe dual-window token bucket rate limiter for API requests.
# Manages continuous minute-level and daily quota allowances with bursts.
# Throttles outbound requests and records sliding-window call history.
class TokenBucketRateLimiter:
    """Token bucket rate limiter for controlling API request rates.

    Maintains two token buckets: one refilled per minute, one per day.
    Each request consumes one token from each bucket.  If tokens are
    exhausted, the caller either waits (minute bucket) or raises
    ``RateLimitError`` (daily bucket).
    """

    # Initializes TokenBucketRateLimiter with quota limits and burst allowances.
    # Sets up minute and daily token balances, refill clocks, and mutex lock.
    # Allocates fixed-length deque for recording recent request timestamps.
    def __init__(
        self,
        requests_per_minute: int = 15,
        requests_per_day: int = 1500,
        burst_allowance: int = 3
    ):
        self.rpm = requests_per_minute
        self.rpd = requests_per_day
        self.burst = burst_allowance

        # Token buckets (current fill levels)
        self.minute_tokens = float(requests_per_minute)
        self.day_tokens = float(requests_per_day)

        # Timestamps for calculating token refill
        self.last_refill_minute = time.time()
        self.last_refill_day = time.time()

        # Thread safety for concurrent FastAPI requests
        self._lock = Lock()

        # Sliding window of recent request timestamps (for status reporting)
        self.request_history = deque(maxlen=1500)

    # Refills minute and daily token bucket allocations based on elapsed time.
    # Calculates fractional token accrual proportional to elapsed seconds.
    # Caps accumulated tokens at configured maximum limits plus burst buffer.
    def _refill_tokens(self):
        """Refill tokens based on elapsed time since last refill."""
        now = time.time()
        
        # Refill minute tokens
        minute_elapsed = now - self.last_refill_minute
        if minute_elapsed > 0:
            self.minute_tokens = min(
                float(self.rpm + self.burst),
                self.minute_tokens + (minute_elapsed / 60.0) * self.rpm
            )
            self.last_refill_minute = now
        
        # Refill day tokens (reset at midnight or after 24 hours)
        day_elapsed = now - self.last_refill_day
        if day_elapsed >= 86400:  # 24 hours
            self.day_tokens = float(self.rpd)
            self.last_refill_day = now
    
    # Attempts to acquire execution token from both minute and daily buckets.
    # Deducts available tokens or raises RateLimitError when limits are breached.
    # Respects maximum wait timeout or sleeps until required tokens accumulate.
    def acquire(self, timeout: Optional[float] = None) -> bool:
        """
        Attempt to acquire a token for making a request.
        
        Args:
            timeout: Maximum time to wait for a token (seconds).  ``None``
                uses ``LLM_RATE_LIMIT_MAX_WAIT_SECONDS`` (default 0 = fail fast).
            
        Returns:
            True if token acquired, raises RateLimitError otherwise
        """
        if timeout is None:
            timeout = max_wait_seconds()
        start_time = time.time()
        
        while True:
            with self._lock:
                self._refill_tokens()
                
                # Check if we have tokens available
                if self.minute_tokens >= 1.0 and self.day_tokens >= 1.0:
                    self.minute_tokens -= 1.0
                    self.day_tokens -= 1.0
                    self.request_history.append(time.time())
                    logger.debug(f"Token acquired. Minute: {self.minute_tokens:.1f}, Day: {self.day_tokens:.1f}")
                    return True
                
                # Calculate wait time
                if self.day_tokens < 1.0:
                    wait_time = 86400 - (time.time() - self.last_refill_day)
                    raise RateLimitError(
                        "Daily quota exhausted. Please try again tomorrow.",
                        retry_after=wait_time
                    )
                
                # Wait for minute token refill
                wait_time = (1.0 - self.minute_tokens) * (60.0 / self.rpm)
            
            # Check timeout (fail fast when no wait budget remains)
            if time.time() - start_time + wait_time > timeout:
                from utils.prometheus_metrics import LLM_RATE_LIMITED_TOTAL

                LLM_RATE_LIMITED_TOTAL.inc()
                raise RateLimitError(
                    f"Rate limit timeout after {timeout}s. Try again in {wait_time:.1f}s",
                    retry_after=wait_time
                )
            
            # Wait and retry
            logger.info(f"Rate limiting: waiting {min(wait_time, 5.0):.1f}s...")
            time.sleep(min(wait_time, 5.0))
    
    # Gathers instantaneous token balances and recent request frequencies.
    # Computes request counts across the trailing minute and hour windows.
    # Returns status dictionary reflecting real-time rate limiter metrics.
    def get_status(self) -> dict:
        """Get current rate limiter status."""
        with self._lock:
            self._refill_tokens()
            return {
                "minute_tokens_available": self.minute_tokens,
                "day_tokens_available": self.day_tokens,
                "requests_last_minute": sum(
                    1 for t in self.request_history 
                    if time.time() - t < 60
                ),
                "requests_last_hour": sum(
                    1 for t in self.request_history 
                    if time.time() - t < 3600
                )
            }


# Retry management engine coordinating exponential backoff and jitter.
# Analyzes error conditions to distinguish transient faults from terminal ones.
# Governs automatic retry attempts for outbound network and service calls.
class RetryHandler:
    """
    Handles retries with exponential backoff for API calls.
    """
    
    # Initializes RetryHandler with retry limits, delay ranges, and base factors.
    # Configures maximum allowed retry attempts and exponential backoff base.
    # Establishes delay bounding parameters to constrain total wait time.
    def __init__(
        self,
        max_retries: int = 5,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
    
    # Calculates backoff delay interval for a specific retry attempt number.
    # Applies exponential scaling with randomized jitter to prevent herd behavior.
    # Clamps calculated delay duration at configured maximum delay limit.
    def calculate_delay(self, attempt: int, retry_after: Optional[float] = None) -> float:
        """Calculate delay for a given retry attempt."""
        if retry_after:
            return min(retry_after, self.max_delay)
        
        # Exponential backoff with 0-25% jitter
        delay = self.base_delay * (self.exponential_base ** attempt)
        return min(delay * (1.0 + random.random() * 0.25), self.max_delay)
    
    # Evaluates whether an exception warrants an automatic retry attempt.
    # Fails fast on quota exhaustion (429), auth failure (403), or not found (404).
    # Returns boolean retry decision and optional suggested delay duration.
    def should_retry(self, exception: Exception) -> tuple[bool, Optional[float]]:
        """
        Determine if an exception should trigger a retry.
        
        Returns:
            Tuple of (should_retry, suggested_delay)
        """
        error_str = str(exception).lower()
        
        # Quota / rate limit errors (429): do not retry, fail fast to fallback
        if "429" in error_str or "resource_exhausted" in error_str or "too many requests" in error_str:
            return False, None

        # Model not found (404): caller should fail over model immediately, not retry
        if "404" in error_str or "not found" in error_str:
            return False, None

        # Transient errors that might succeed on retry
        if any(x in error_str for x in ["timeout", "connection", "temporary", "503", "502"]):
            return True, None
        
        # Quota exhausted (daily limit) - don't retry
        if "quota" in error_str and "day" in error_str:
            return False, None
        
        # Permission denied (leaked key) - don't retry
        if "403" in error_str or "permission_denied" in error_str:
            return False, None
        
        return False, None
    
    # Parses explicit retry-after delay duration from exception error text.
    # Scans error strings for delay patterns and numeric second expressions.
    # Returns extracted retry delay float or none if no delay is specified.
    def _extract_retry_after(self, error_message: str) -> Optional[float]:
        """Extract retry-after seconds from error message."""
        import re
        
        # Match patterns like "retry in 38.927704073s" or "retryDelay: '38s'"
        patterns = [
            r"retry in (\d+\.?\d*)s",
            r"retryDelay['\": ]+(\d+)",
            r"please retry in (\d+\.?\d*)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, error_message.lower())
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    pass
        
        return None


# Global instances
# Defaults match Gemini's free tier (15 RPM / 1500 RPD); override per process
# with LLM_RPM / LLM_RPD / LLM_BURST (e.g. a paid key, or RPM split across workers).
_rate_limiter = _build_rate_limiter()

# Transient-error retries run inside a request thread, so keep them short:
# at most LLM_MAX_ATTEMPTS attempts and a few seconds of total backoff.
_retry_handler = RetryHandler(
    max_retries=max(1, _env_int("LLM_MAX_ATTEMPTS", 2)),
    base_delay=_env_float("LLM_RETRY_BASE_DELAY_SECONDS", 1.0),
    max_delay=_env_float("LLM_RETRY_MAX_DELAY_SECONDS", 5.0),
)


# Function decorator enforcing token bucket rate limiting and retry handling.
# Intercepts invocations to acquire quota tokens and retry transient errors.
# Wraps target callable preserving signature and propagating non-retryable errors.
def with_rate_limit_and_retry(func: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator that adds rate limiting and retry logic to any function.
    
    Usage:
        @with_rate_limit_and_retry
        def call_gemini_api(...):
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> T:
        last_exception = None
        
        for attempt in range(_retry_handler.max_retries):
            try:
                # Acquire rate limit token (fails fast; see max_wait_seconds)
                _rate_limiter.acquire()
                
                # Execute the function
                result = func(*args, **kwargs)
                
                if attempt > 0:
                    logger.info(f"Request succeeded after {attempt + 1} attempts")
                
                return result
                
            except RateLimitError as e:
                logger.warning(f"Rate limit error: {e}. Retry after: {e.retry_after:.1f}s")
                raise  # Don't retry rate limit errors from our own limiter
                
            except Exception as e:
                last_exception = e
                should_retry, retry_after = _retry_handler.should_retry(e)
                
                if not should_retry:
                    logger.error(f"Non-retryable error: {e}")
                    raise
                
                if attempt < _retry_handler.max_retries - 1:
                    delay = _retry_handler.calculate_delay(attempt, retry_after)
                    logger.warning(
                        f"Attempt {attempt + 1}/{_retry_handler.max_retries} failed: {str(e)[:100]}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(f"All {_retry_handler.max_retries} attempts failed")
        
        raise last_exception or Exception("Unknown error after retries")
    
    return wrapper


# Queries current status and available token capacities of global limiter.
# Dispatches query to global TokenBucketRateLimiter singleton instance.
# Returns dictionary detailing token counts and sliding-window statistics.
def get_rate_limiter_status() -> dict:
    """Get the current status of the global rate limiter."""
    return _rate_limiter.get_status()


# Reconstructs global TokenBucketRateLimiter singleton from environment.
# Resets active token balances and cleans request history for test isolation.
# Emits informational log indicating completion of rate limiter reset.
def reset_rate_limiter():
    """Reset the rate limiter (useful for testing or after quota reset)."""
    global _rate_limiter
    _rate_limiter = _build_rate_limiter()
    logger.info("Rate limiter reset")
