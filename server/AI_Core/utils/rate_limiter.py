"""
Rate Limiter and Retry Handler for Gemini API calls.
Provides exponential backoff, request throttling, and graceful error handling.
"""

import logging
import time
from collections import deque
from functools import wraps
from threading import Lock
from typing import Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar('T')


class RateLimitError(Exception):
    """Custom exception for rate limit errors with retry information."""
    def __init__(self, message: str, retry_after: float = 60.0):
        super().__init__(message)
        self.retry_after = retry_after


class TokenBucketRateLimiter:
    """
    Token bucket rate limiter for controlling API request rates.
    More sophisticated than simple time-based limiting.
    """
    
    def __init__(
        self,
        requests_per_minute: int = 10,
        requests_per_day: int = 1000,
        burst_allowance: int = 2
    ):
        self.rpm = requests_per_minute
        self.rpd = requests_per_day
        self.burst = burst_allowance
        
        # Token buckets
        self.minute_tokens = float(requests_per_minute)
        self.day_tokens = float(requests_per_day)
        
        # Timing
        self.last_refill_minute = time.time()
        self.last_refill_day = time.time()
        
        # Thread safety
        self._lock = Lock()
        
        # Request tracking
        self.request_history = deque(maxlen=1500)  # Track last 1500 requests
        
    def _refill_tokens(self):
        """Refill tokens based on elapsed time."""
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
    
    def acquire(self, timeout: float = 30.0) -> bool:
        """
        Attempt to acquire a token for making a request.
        
        Args:
            timeout: Maximum time to wait for a token (seconds)
            
        Returns:
            True if token acquired, raises RateLimitError otherwise
        """
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
            
            # Check timeout
            if time.time() - start_time + wait_time > timeout:
                raise RateLimitError(
                    f"Rate limit timeout after {timeout}s. Try again in {wait_time:.1f}s",
                    retry_after=wait_time
                )
            
            # Wait and retry
            logger.info(f"Rate limiting: waiting {min(wait_time, 5.0):.1f}s...")
            time.sleep(min(wait_time, 5.0))
    
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


class RetryHandler:
    """
    Handles retries with exponential backoff for API calls.
    """
    
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
    
    def calculate_delay(self, attempt: int, retry_after: Optional[float] = None) -> float:
        """Calculate delay for a given retry attempt."""
        if retry_after:
            return min(retry_after, self.max_delay)
        
        # Exponential backoff with jitter
        delay = self.base_delay * (self.exponential_base ** attempt)
        jitter = delay * 0.1 * (hash(time.time()) % 10) / 10  # 0-10% jitter
        return min(delay + jitter, self.max_delay)
    
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
_rate_limiter = TokenBucketRateLimiter(
    requests_per_minute=10,  # Conservative: Gemini free tier is 15 RPM
    requests_per_day=1200,   # Conservative: Gemini free tier is 1500 RPD
    burst_allowance=3
)

_retry_handler = RetryHandler(
    max_retries=5,
    base_delay=2.0,
    max_delay=60.0
)


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
                # Acquire rate limit token
                _rate_limiter.acquire(timeout=30.0)
                
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


def get_rate_limiter_status() -> dict:
    """Get the current status of the global rate limiter."""
    return _rate_limiter.get_status()


def reset_rate_limiter():
    """Reset the rate limiter (useful for testing or after quota reset)."""
    global _rate_limiter
    _rate_limiter = TokenBucketRateLimiter(
        requests_per_minute=10,
        requests_per_day=1200,
        burst_allowance=3
    )
    logger.info("Rate limiter reset")
