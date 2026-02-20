from enum import Enum


class AutopilotRunStatus(str, Enum):
    APPROVED = "approved"
    AWAITING_APPROVAL = "awaiting_approval"
    EXECUTING = "executing"
    FAILED = "failed"
    PLANNED = "planned"
    SIMULATED = "simulated"
    SUCCEEDED = "succeeded"

    def __str__(self) -> str:
        return str(self.value)
