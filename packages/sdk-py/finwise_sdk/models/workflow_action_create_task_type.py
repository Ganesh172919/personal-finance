from enum import Enum


class WorkflowActionCreateTaskType(str, Enum):
    CREATE_TASK = "create_task"

    def __str__(self) -> str:
        return str(self.value)
