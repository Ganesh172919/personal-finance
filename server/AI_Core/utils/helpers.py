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


# Logging filter injecting current request ID into logging record context.
# Accesses thread-scoped request ID ContextVar populated during request entry.
# Guarantees auditability and correlation across concurrent logging events.
class RequestIdFilter(logging.Filter):
    """Injects the current request-id into every log record.

    Uses ``contextvars`` so that concurrent FastAPI requests each
    get their own request-id without cross-contamination.
    """
    # Injects request identifier into current logging record instance.
    # Attaches request_id attribute retrieved from request metrics.
    # Returns true to allow record processing by downstream logging handlers.
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


# Custom logging formatter rendering records as structured JSON documents.
# Extracts core timestamp, log level, logger name, and extra context fields.
# Formats complete record into JSON string for ingestion by log collectors.
class JsonFormatter(logging.Formatter):
    # Formats logging record into JSON payload string containing metadata.
    # Serializes timing metrics, agent tags, and exception tracebacks.
    # Returns stringified JSON dictionary representing log statement.
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


# Configures application-wide JSON structured logging with request correlation.
# Attaches JsonFormatter and RequestIdFilter to stdout stream handler.
# Returns configured Logger instance for FinWise AI Core subsystem.
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


# Logging adapter enriching log records with agent-specific contextual metadata.
# Injects agent name, analysis type, and complexity score automatically.
# Facilitates fine-grained distributed log filtering for multi-agent workflows.
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

    # Initializes agent logging wrapper with agent name and optional metrics.
    # Obtains underlying logger instance named with agent namespace.
    # Configures persistent context attributes for downstream logging calls.
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

    # Merges agent context fields into extra logging parameters dictionary.
    # Combines agent name, analysis type, and complexity score.
    # Returns complete dictionary for passing to underlying logger methods.
    def _extra(self, **kwargs: Any) -> Dict[str, Any]:
        """Build the ``extra`` dict with agent context merged in."""
        base: Dict[str, Any] = {"agent_name": self.agent_name}
        if self.analysis_type is not None:
            base["analysis_type"] = self.analysis_type
        if self.complexity_score is not None:
            base["complexity_score"] = self.complexity_score
        base.update(kwargs)
        return base

    # Emits debug level log message enriched with agent context attributes.
    # Merges extra parameters and delegates to underlying logger instance.
    # Outputs structured debug record with agent name and execution state.
    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.debug(msg, *args, extra=extra, **kwargs)

    # Emits info level log message enriched with agent context attributes.
    # Merges extra parameters and delegates to underlying logger instance.
    # Outputs structured informational record with agent metadata.
    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.info(msg, *args, extra=extra, **kwargs)

    # Emits warning level log message enriched with agent context attributes.
    # Captures non-fatal agent anomalies and degraded operational states.
    # Outputs structured warning record preserving agent tracking tags.
    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.warning(msg, *args, extra=extra, **kwargs)

    # Emits error level log message enriched with agent context attributes.
    # Records agent failure states while attaching contextual identifiers.
    # Outputs structured error record for incident alerting systems.
    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.error(msg, *args, extra=extra, **kwargs)

    # Emits error level log message including formatted stack traceback.
    # Enriches exception log record with current agent execution context.
    # Outputs full exception details to assist in error diagnostics.
    def exception(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.exception(msg, *args, extra=extra, **kwargs)

    # Returns clone of AgentLogger configured with updated analysis type.
    # Implements immutable pattern for updating contextual log fields.
    # Returns new AgentLogger instance retaining original agent name.
    def with_analysis_type(self, analysis_type: str) -> "AgentLogger":
        """Return a copy with a different analysis_type (immutable pattern)."""
        return AgentLogger(
            self.agent_name,
            logger_name=self._logger.name,
            analysis_type=analysis_type,
            complexity_score=self.complexity_score,
        )

    # Returns clone of AgentLogger configured with updated complexity score.
    # Creates new adapter instance while preserving existing agent tags.
    # Returns new AgentLogger instance reflecting task complexity score.
    def with_complexity(self, score: float) -> "AgentLogger":
        """Return a copy with a different complexity_score."""
        return AgentLogger(
            self.agent_name,
            logger_name=self._logger.name,
            analysis_type=self.analysis_type,
            complexity_score=score,
        )


# Logging adapter enriching log events with workflow and phase identifiers.
# Correlates end-to-end multi-agent execution sequences across workflow nodes.
# Provides helper methods for phase transitions and child agent loggers.
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

    # Initializes workflow logger with unique workflow execution identifier.
    # Accepts optional initial workflow phase string and custom logger name.
    # Sets up internal logger reference under the workflow namespace.
    def __init__(
        self,
        workflow_id: str,
        phase: Optional[str] = None,
        logger_name: Optional[str] = None,
    ):
        self.workflow_id = workflow_id
        self.phase = phase
        self._logger = logging.getLogger(logger_name or "finwise.ai_core.workflow")

    # Assembles extra context dictionary populated with workflow metadata.
    # Merges workflow_id and workflow_phase attributes with caller kwargs.
    # Returns composite dictionary ready for logging handler consumption.
    def _extra(self, **kwargs: Any) -> Dict[str, Any]:
        base: Dict[str, Any] = {"workflow_id": self.workflow_id}
        if self.phase is not None:
            base["workflow_phase"] = self.phase
        base.update(kwargs)
        return base

    # Updates current active phase identifier for workflow execution trace.
    # Modifies internal phase state to reflect current graph progression.
    # Ensures subsequent log emissions capture new workflow phase.
    def set_phase(self, phase: str) -> None:
        """Update the current workflow phase."""
        self.phase = phase

    # Logs debug level message augmented with workflow ID and phase tags.
    # Injects workflow context dictionary into extra parameters.
    # Dispatches formatted debug statement to underlying logger instance.
    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.debug(msg, *args, extra=extra, **kwargs)

    # Logs informational event augmented with workflow ID and phase tags.
    # Records normal graph execution milestones and agent transitions.
    # Dispatches formatted info statement to underlying logger instance.
    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.info(msg, *args, extra=extra, **kwargs)

    # Logs warning event augmented with workflow ID and phase tags.
    # Captures recoverable graph anomalies or unexpected execution paths.
    # Dispatches formatted warning statement to underlying logger instance.
    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.warning(msg, *args, extra=extra, **kwargs)

    # Logs error event augmented with workflow ID and phase tags.
    # Records critical workflow node execution failures and aborts.
    # Dispatches formatted error statement to underlying logger instance.
    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.error(msg, *args, extra=extra, **kwargs)

    # Logs error event with full exception traceback and workflow tags.
    # Captures unhandled workflow exceptions for debugging and analysis.
    # Dispatches formatted exception statement to underlying logger.
    def exception(self, msg: str, *args: Any, **kwargs: Any) -> None:
        extra = self._extra(**kwargs.pop("extra", {}))
        self._logger.exception(msg, *args, extra=extra, **kwargs)

    # Creates child WorkflowLogger scoped to specific agent in this workflow.
    # Inherits active workflow ID and phase while scoping logger hierarchy.
    # Returns dedicated WorkflowLogger instance tagged with agent sub-path.
    def child(self, agent_name: str) -> "WorkflowLogger":
        """Return a derived WorkflowLogger for a specific agent within this workflow."""
        child_logger = WorkflowLogger(
            workflow_id=self.workflow_id,
            phase=self.phase,
            logger_name=f"finwise.ai_core.workflow.{agent_name}",
        )
        return child_logger


# Validates string structure against standard email address format pattern.
# Tests user input against regular expression matching user and domain parts.
# Returns boolean flag indicating whether email address format is valid.
def validate_email(email: str) -> bool:
    """Validate email format."""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


# Formats monetary number into currency-formatted string with symbol.
# Delegates formatting to currency helper using ISO currency code.
# Returns formatted currency string with comma grouping and decimals.
def format_currency(amount: float, currency_code: str = "INR") -> str:
    """Format currency with proper formatting.

    Uses the ISO 4217 currency code to select the symbol.
    Falls back to the code itself if the symbol is not known.
    """
    from utils.agent_helpers import format_currency_amount
    return format_currency_amount(amount, currency_code)


# Extracts financial amounts from unstructured free text using regexes.
# Identifies numbers linked to income, expenses, savings, and debt keywords.
# Returns dictionary mapping recognized categories to parsed float values.
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


# Calculates integer age in years from ISO birth date string format.
# Compares birth month and day against current date to adjust year delta.
# Returns computed integer age or raises ValueError on invalid date format.
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


# Generates timestamp-based unique identifier string for financial reports.
# Formats current date and time into compact numerical string with prefix.
# Returns unique report ID string for tracking generated artifacts.
def generate_report_id() -> str:
    """Generate unique report ID."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"FINWISE_{timestamp}"


# Deserializes JSON string safely into dictionary handling syntax errors.
# Catches JSONDecodeError returning empty dictionary on invalid syntax.
# Returns parsed dictionary data or empty dictionary fallback.
def safe_json_loads(json_string: str) -> Dict[str, Any]:
    """Safely parse JSON string with error handling."""
    try:
        return json.loads(json_string)
    except json.JSONDecodeError:
        return {}


# Calculates total month difference elapsed between two ISO date strings.
# Computes calendar year and month delta handling partial years.
# Returns non-negative integer representing elapsed month duration.
def calculate_months_between(start_date: str, end_date: str) -> int:
    """Calculate months between two dates."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        months = (end.year - start.year) * 12 + (end.month - start.month)
        return max(0, months)
    except ValueError:
        return 0


# Utility class providing ANSI escape codes for colored terminal formatting.
# Defines standard color constants for console styling in CLI utilities.
# Supplies class methods for formatting success, warning, and error text.
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

    # Wraps input text in green ANSI color escape codes for terminal display.
    # Appends reset code to ensure subsequent console output remains unstyled.
    # Returns formatted string displaying green text in supported terminals.
    @classmethod
    def success(cls, text: str) -> str:
        return f"{cls.GREEN}{text}{cls.END}"

    # Wraps input text in yellow ANSI color escape codes for terminal display.
    # Appends reset code to ensure subsequent console output remains unstyled.
    # Returns formatted string displaying yellow text in supported terminals.
    @classmethod
    def warning(cls, text: str) -> str:
        return f"{cls.YELLOW}{text}{cls.END}"

    # Wraps input text in red ANSI color escape codes for terminal display.
    # Appends reset code to ensure subsequent console output remains unstyled.
    # Returns formatted string displaying red text in supported terminals.
    @classmethod
    def error(cls, text: str) -> str:
        return f"{cls.RED}{text}{cls.END}"

    # Wraps input text in cyan ANSI color escape codes for terminal display.
    # Appends reset code to ensure subsequent console output remains unstyled.
    # Returns formatted string displaying cyan text in supported terminals.
    @classmethod
    def info(cls, text: str) -> str:
        return f"{cls.CYAN}{text}{cls.END}"

    # Wraps input text in bold magenta ANSI escape codes for section headers.
    # Appends reset code to ensure subsequent console output remains unstyled.
    # Returns formatted string displaying bold colored header in terminals.
    @classmethod
    def header(cls, text: str) -> str:
        return f"{cls.BOLD}{cls.MAGENTA}{text}{cls.END}"
