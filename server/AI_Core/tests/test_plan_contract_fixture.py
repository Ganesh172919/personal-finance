from __future__ import annotations

import json
from pathlib import Path

from contracts.plan import Plan


def test_plan_contract_fixture_validates_against_pydantic_model():
    fixture_path = Path(__file__).resolve().parents[2] / "docs" / "contracts" / "plan.example.json"
    data = json.loads(fixture_path.read_text(encoding="utf-8"))

    Plan.model_validate(data)

