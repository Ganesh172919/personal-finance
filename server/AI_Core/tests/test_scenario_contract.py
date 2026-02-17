from fastapi.testclient import TestClient

from api_service import app

PROFILE = {
    "age": 32,
    "annual_income": 900000,
    "monthly_expenses": 45000,
    "savings": 180000,
    "debts": [
        {
            "name": "Credit Card",
            "balance": 60000,
            "interest_rate": 24.0,
            "minimum_payment": 5000,
        }
    ],
    "financial_goals": [
        {"name": "Emergency Fund", "target": 300000, "timeline_months": 18, "priority": 1}
    ],
    "risk_tolerance": "moderate",
    "investment_experience": "beginner",
    "time_horizon": 10,
    "transactions": [],
}


def test_what_if_scenario_contract_and_profile_aware_fields():
    with TestClient(app) as client:
        response = client.post(
            "/api/agents/what-if-scenario",
            json={
                "user_profile": PROFILE,
                "scenario_type": "expense",
                "amount": 5000,
                "description": "New recurring bill",
                "assumptions": {"months": 12, "inflation_pct": 6.0},
            },
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["scenario_type"] == "expense"
        assert data["amount"] == 5000
        assert "baseline" in data
        assert "delta" in data
        assert "assumptions" in data
        assert "recommendations" in data
        assert data["baseline"]["monthly_income"] > 0
        assert data["baseline"]["monthly_expenses"] > 0
        assert data["delta"]["monthly_surplus_change"] < 0
        assert isinstance(data["adjustments"], list)


def test_investment_scenario_returns_projected_value_shape():
    with TestClient(app) as client:
        response = client.post(
            "/api/agents/what-if-scenario",
            json={
                "user_profile": PROFILE,
                "scenario_type": "investment",
                "amount": 3000,
                "description": "Increase SIP",
                "assumptions": {"months": 24, "expected_return_pct": 10.0},
            },
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["scenario_type"] == "investment"
        assert data["delta"]["projected_investment_value"] is not None
        assert data["delta"]["new_monthly_surplus"] == data["newBudget"]
