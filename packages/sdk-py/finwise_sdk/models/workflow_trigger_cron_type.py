from enum import Enum


class WorkflowTriggerCronType(str, Enum):
    CRON = "cron"

    def __str__(self) -> str:
        return str(self.value)
