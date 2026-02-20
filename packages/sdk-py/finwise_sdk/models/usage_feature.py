from enum import Enum


class UsageFeature(str, Enum):
    API_REQUESTS = "api_requests"
    AUTOPILOT_ACTIONS = "autopilot_actions"
    CONNECTOR_SYNC_RECORDS = "connector_sync_records"
    EXPORT_ACCESS = "export_access"
    MARKETPLACE_INSTALLS = "marketplace_installs"
    MONTHLY_AI_CALLS = "monthly_ai_calls"
    OCR_QUOTA = "ocr_quota"
    SCENARIO_DEPTH = "scenario_depth"
    WORKFLOW_RUNS = "workflow_runs"

    def __str__(self) -> str:
        return str(self.value)
