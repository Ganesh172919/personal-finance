from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class KeyMetrics(BaseModel):
    monthly_net_cash_flow: Optional[float] = None
    savings_rate: Optional[float] = None
    debt_to_income: Optional[float] = None
    emergency_fund_months: Optional[float] = None
    total_debt: Optional[float] = None


class ActionItem(BaseModel):
    title: str
    why: str
    steps: List[str] = Field(default_factory=list)
    priority: Literal["low", "medium", "high"] = "medium"
    expected_impact: str
    kind: Literal["cashflow", "budget", "debt", "invest", "goal", "education", "generic"] = "generic"
    due_days: Optional[int] = None
    id: Optional[str] = None


class ActionBuckets(BaseModel):
    next_7_days: List[ActionItem] = Field(default_factory=list)
    next_30_days: List[ActionItem] = Field(default_factory=list)
    next_12_months: List[ActionItem] = Field(default_factory=list)


class Plan(BaseModel):
    executive_summary: str
    key_metrics: KeyMetrics = Field(default_factory=KeyMetrics)
    actions: ActionBuckets = Field(default_factory=ActionBuckets)
    assumptions: List[str] = Field(default_factory=list)
    data_warnings: List[str] = Field(default_factory=list)
