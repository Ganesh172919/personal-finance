from enum import Enum


class FinancialStorySharePayloadType(str, Enum):
    FINANCIAL_STORY = "financial_story"

    def __str__(self) -> str:
        return str(self.value)
