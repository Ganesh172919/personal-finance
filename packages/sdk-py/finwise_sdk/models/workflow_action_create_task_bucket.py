from enum import IntEnum


class WorkflowActionCreateTaskBucket(IntEnum):
    VALUE_7 = 7
    VALUE_30 = 30
    VALUE_365 = 365

    def __str__(self) -> str:
        return str(self.value)
