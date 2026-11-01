"""
helpers.py - Utility Functions and Logging Setup
=================================================

Provides general-purpose utility functions used throughout the AI Core:

Logging
-------
- ``setup_logging()`` -- configures JSON-structured logging with
  request-id correlation.  Every log line includes a ``request_id``
  field so that all events for a single HTTP request can be correlated.
- ``RequestIdFilter`` -- logging filter that injects the current
  request-id from ``contextvars`` into each log record.
- ``JsonFormatter`` -- formats log records as JSON for structured
  log aggregation (e.g. ELK stack, Datadog).

Financial helpers
-----------------
- ``format_currency()`` -- formats amounts in Indian Rupees.
- ``parse_financial_input()`` -- extracts financial figures from
  free-text user input using regex.
- ``calculate_age()``, ``calculate_months_between()`` -- date math.

General helpers
---------------
- ``validate_email()``, ``safe_json_loads()``, ``generate_report_id()``.
- ``ColorFormatter`` -- ANSI color codes for CLI console output.
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from utils.request_metrics import get_request_id


class RequestIdFilter(logging.Filter):
    """Injects the current request-id into every log record.

    Uses ``contextvars`` so that concurrent FastAPI requests each
    get their own request-id without cross-contamination.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id

        for key in (
            "event", "method", "path", "status", "duration_ms",
            "agent_name", "analysis_type", "complexity_score",
            "workflow_id", "workflow_phase",
            "provider", "model", "token_in", "token_out",
            "latency_ms", "cost_usd", "key_id",
            "parallel_agents", "retry_reason",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> logging.Logger:
    """Setup JSON logging with request_id support."""

    log_level = os.getenv("LOG_LEVEL", level).upper()

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(JsonFormatter())
    console_handler.addFilter(RequestIdFilter())

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers = []
    root_logger.addHandler(console_handler)

    return logging.getLogger("finwise.ai_core")


class AgentLogger:
    """Wraps a standard logger with agent-specific context fields.

    Every log message emitted through this wrapper automatically includes
    ``agent_name``, ``analysis_type``, and ``complexity_score`` in the
    structured output so that agent executions can be correlated in log
    aggregation systems.

    Usage::

        agent_logger = AgentLogger("budget_planner", analysis_type="budget_planning")
        agent_logger.info("Starting budget analysis")
        # -> {"level": "info", "agent_name": "budget_planner", "analysis_type": "budget_planning", ...}
    """

    def __init__(
        self,
        agent_name: str,
        logger_name: Optional[str] = None,
        analysis_type: Optional[str] = None,
        complexity_score: Optional[float] = None,
    ):
        self.agent_name = agent_name
        self.analysis_type = analysis_type
        self.complexity_score = complexity_score
        self._logger = logging.getLogger(logger_name or f"finwise.ai_core.agent.{agent_name}")

    def _extra(self, **kwargs: Any) -> Dict[str, Any]:
        """Build the ``extra`` dict with agent context merged in."""
        base: Dict[str, Any] = {"agent_name": self.agent_name}
        if self.analysis_type is not None:
            base["analysis_type"] = self.analysis_type
        if self.complexity_score is not None:
            base["complexity_score"] = self.complexity_score
        base.update(kwargs)
        return base

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.debug(msg, *args, extra=extra, **kwargs)

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.info(msg, *args, extra=extra, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.warning(msg, *args, extra=extra, **kwargs)

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.error(msg, *args, extra=extra, **kwargs)

    def exception(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.exception(msg, *args, extra=extra, **kwargs)

    def with_analysis_type(self, analysis_type: str) -> "AgentLogger":
        """Return a copy with a different analysis_type (immutable pattern)."""
        return AgentLogger(
            self.agent_name,
            logger_name=self._logger.name,
            analysis_type=analysis_type,
            complexity_score=self.complexity_score,
        )

    def with_complexity(self, score: float) -> "AgentLogger":
        """Return a copy with a different complexity_score."""
        return AgentLogger(
            self.agent_name,
            logger_name=self._logger.name,
            analysis_type=self.analysis_type,
            complexity_score=score,
        )


class WorkflowLogger:
    """Wraps a standard logger with workflow-scoped context fields.

    Every log message includes ``workflow_id`` and ``workflow_phase`` so
    that all events for a single workflow execution can be correlated.

    Usage::

        wf_logger = WorkflowLogger(workflow_id="wf-abc123", phase="routing")
        wf_logger.info("Routing to budget_planner")
        wf_logger.set_phase("execution")
        wf_logger.info("Budget planner started")
    """

    def __init__(
        self,
        workflow_id: str,
        phase: Optional[str] = None,
        logger_name: Optional[str] = None,
    ):
        self.workflow_id = workflow_id
        self.phase = phase
        self._logger = logging.getLogger(logger_name or "finwise.ai_core.workflow")

    def _extra(self, **kwargs: Any) -> Dict[str, Any]:
        base: Dict[str, Any] = {"workflow_id": self.workflow_id}
        if self.phase is not None:
            base["workflow_phase"] = self.phase
        base.update(kwargs)
        return base

    def set_phase(self, phase: str) -> None:
        """Update the current workflow phase."""
        self.phase = phase

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.debug(msg, *args, extra=extra, **kwargs)

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.info(msg, *args, extra=extra, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.warning(msg, *args, extra=extra, **kwargs)

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.error(msg, *args, extra=extra, **kwargs)

    def exception(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.exception(msg, *args, extra=extra, **kwargs)

    def child(self, agent_name: str) -> "WorkflowLogger":
        """Return a derived WorkflowLogger for a specific agent within this workflow."""
        child_logger = WorkflowLogger(
            workflow_id=self.workflow_id,
            phase=self.phase,
            logger_name=f"finwise.ai_core.workflow.{agent_name}",
        )
        return child_logger


def validate_email(email: str) -> bool:
    """Validate email format."""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def format_currency(amount: float, currency_code: str = "INR") -> str:
    """Format currency with proper formatting.

    Uses the ISO 4217 currency code to select the symbol.
    Falls back to the code itself if the symbol is not known.
    """
    from utils.agent_helpers import format_currency_amount
    return format_currency_amount(amount, currency_code)


def parse_financial_input(text: str) -> Dict[str, Any]:
    """Parse financial information from user input."""
    patterns = {
        "income": r"\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:salary|income|earn)",
        "expenses": r"\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:spend|expense|cost)",
        "savings": r"\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:save|savings|emergency fund)",
        "debt": r"\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:debt|loan|owe|credit card)",
    }

    extracted: Dict[str, Any] = {}
    for key, pattern in patterns.items():
        matches = re.findall(pattern, text, re.IGNORECASE)
        if not matches:
            continue

        try:
            value = float(matches[0].replace(",", ""))
            extracted[key] = value
        except ValueError:
            continue

    return extracted


def calculate_age(birth_date: str) -> int:
    """Calculate age from birth date string."""
    try:
        birth_dt = datetime.strptime(birth_date, "%Y-%m-%d")
        today = datetime.now()
        age = today.year - birth_dt.year

        if today.month < birth_dt.month or (today.month == birth_dt.month and today.day < birth_dt.day):
            age -= 1

        return age
    except ValueError as error:
        raise ValueError("Invalid date format. Use YYYY-MM-DD") from error


def generate_report_id() -> str:
    """Generate unique report ID."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"FINWISE_{timestamp}"


def safe_json_loads(json_string: str) -> Dict[str, Any]:
    """Safely parse JSON string with error handling."""
    try:
        return json.loads(json_string)
    except json.JSONDecodeError:
        return {}


def calculate_months_between(start_date: str, end_date: str) -> int:
    """Calculate months between two dates."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        months = (end.year - start.year) * 12 + (end.month - start.month)
        return max(0, months)
    except ValueError:
        return 0


class ColorFormatter:
    """Color formatting for console output."""

    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"
    END = "\033[0m"

    @classmethod
    def success(cls, text: str) -> str:
        return f"{cls.GREEN}{text}{cls.END}"

    @classmethod
    def warning(cls, text: str) -> str:
        return f"{cls.YELLOW}{text}{cls.END}"

    @classmethod
    def error(cls, text: str) -> str:
        return f"{cls.RED}{text}{cls.END}"

    @classmethod
    def info(cls, text: str) -> str:
        return f"{cls.CYAN}{text}{cls.END}"

    @classmethod
    def header(cls, text: str) -> str:
        return f"{cls.BOLD}{cls.MAGENTA}{text}{cls.END}"
