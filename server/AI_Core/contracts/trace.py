from typing import Optional

from pydantic import BaseModel


class WorkflowTraceEntry(BaseModel):
    agent: str
    startedAt: str
    endedAt: str
    status: str
    error: Optional[str] = None

