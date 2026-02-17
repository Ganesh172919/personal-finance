# Week 4 API Contract Updates

## Tasks

### `PATCH /api/tasks/:id`
- Extended body fields:
  - `status`: `"open" | "completed" | "dismissed"` (required)
  - `completed_at`: ISO date-time (optional)
  - `note`: string (optional)
  - `effects`: array of effect descriptors (optional)
  - `completion_evidence`: `{ note?, completed_at? }` (optional)
  - `apply_status`: `"pending" | "succeeded" | "failed"` (optional)
  - `apply_error_code`: string (optional)

### `POST /api/tasks/:id/apply`
- Applies task effects and marks task completed.
- Body:
  - `idempotency_key`: stable key for safe retries (optional, recommended)
  - `completed_at`: ISO date-time (optional)
  - `note`: string (optional)
  - `effects`: array of effect descriptors (optional)
- Response:
  - `task`
  - `applied_effects`
  - `links` (`action_link_id`, linked entity ids)
  - `provenance`
  - `idempotent_replay`
- Effect types:
  - `transaction`
  - `goal_progress`
  - `debt_payment`
  - `profile_update`

## Aggregates

### `GET /api/dashboard/summary`
- Returns canonical dashboard aggregates:
  - `cash_flow`
  - `savings`
  - `goals`
  - `spending`
  - `tasks`
  - `completeness`

### `GET /api/portfolio/summary?months=12`
- Returns canonical portfolio aggregates:
  - `summary`
  - `allocations`
  - `holdings`
  - `performance`
  - `assumptions`

## Scenario Contract

### `POST /api/scenarios/what-if`
- New preferred body:
```json
{
  "parameters": {
    "scenario_type": "expense",
    "amount": 5000,
    "description": "Optional",
    "assumptions": {
      "months": 12,
      "expected_return_pct": 10,
      "inflation_pct": 6
    }
  }
}
```
- Legacy payload shape is still accepted for backward compatibility.

## Provenance

- Transaction and profile-mutation responses now include a `source` object.
- Transaction records now carry `source.origin` for auditability:
  - `manual`, `csv_import`, `receipt_ocr`, `journal`, `task_completion`, `ai_plan`
- Source envelope now supports:
  - `action_link_id`
  - `actor_type`
  - `source_ref`

## Agent Outputs

### `GET /api/agent-outputs/recent`
- Returns compact recent outputs:
  - `id`
  - `type`
  - `created_at`
  - `linked_task_ids`

## Monetization

### `GET /api/plans`
- Returns plan catalog (`free`, `pro`, `team`) and limits.

### `GET /api/entitlements/me`
- Returns resolved entitlements for current user:
  - `plan`, `status`, `limits`, `usage`, `remaining`, `period_key`

### `POST /api/usage-events`
- Internal metering ingestion endpoint.
- Requires `X-Internal-Usage-Token` header matching `USAGE_EVENTS_INTERNAL_TOKEN`.

## Rollout and Rollback

- Feature flags:
  - `TASKS_ENABLED`
  - `RECEIPTS_OCR_ENABLED`
  - `JOURNAL_ENABLED`
  - `METRICS_ENABLED`
- Rollout order:
  - `dev` -> `staging` -> production canary (10%) -> full
- Rollback by endpoint:
  - `POST /api/tasks/:id/apply`: disable via `TASKS_ENABLED=false`
  - `GET /api/dashboard/summary` and `GET /api/portfolio/summary`: route consumers can fallback to existing profile/transaction endpoints
  - `POST /api/scenarios/what-if`: fallback response is preserved in API server + AI Core
  - Metrics surface (`/api/metrics`): disable via `METRICS_ENABLED=false`
- Trigger thresholds:
  - task apply failure rate > 2%
  - AI fallback rate increase > 30% over baseline
  - p95 execution endpoint latency > 1.5x baseline
