from enum import Enum


class ApiKeyScope(str, Enum):
    TRANSACTIONSREAD = "transactions:read"
    TRANSACTIONSWRITE = "transactions:write"
    USAGEREAD = "usage:read"
    WORKFLOWSREAD = "workflows:read"
    WORKFLOWSWRITE = "workflows:write"

    def __str__(self) -> str:
        return str(self.value)
