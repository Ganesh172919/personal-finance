from __future__ import annotations

from fastapi.testclient import TestClient

from api_service import app
from contracts import ProcessResponse

MINIMAL_PROFILE = {
    "age": 30,
    "annual_income": 600000,
    "monthly_expenses": 35000,
    "savings": 50000,
    "debts": [],
    "financial_goals": [],
    "risk_tolerance": "moderate",
    "investment_experience": "beginner",
    "time_horizon": 10,
    "transactions": [],
}

PROFILE_WITH_TRANSACTIONS = {
    **MINIMAL_PROFILE,
    "debts": [
        {
            "name": "Credit Card",
            "balance": 85000,
            "interest_rate": 24.0,
            "minimum_payment": 5000,
        }
    ],
    "financial_goals": [
        {"name": "Emergency Fund", "target": 150000, "timeline_months": 12, "priority": 1},
        {"name": "Vacation", "target": 50000, "timeline_months": 6, "priority": 2},
    ],
    "transactions": [
        {"amount": 50000, "category": "Salary", "description": "Monthly salary", "date": "2026-01-01", "type": "income"},
        {"amount": -12000, "category": "Rent", "description": "Rent", "date": "2026-01-02", "type": "expense"},
        {"amount": -6000, "category": "Groceries", "description": "Groceries", "date": "2026-01-05", "type": "expense"},
        {"amount": -2500, "category": "Dining", "description": "Dining out", "date": "2026-01-10", "type": "expense"},
        {"amount": -3000, "category": "Transport", "description": "Fuel", "date": "2026-01-12", "type": "expense"},
        {"amount": 50000, "category": "Salary", "description": "Monthly salary", "date": "2026-02-01", "type": "income"},
        {"amount": -12000, "category": "Rent", "description": "Rent", "date": "2026-02-02", "type": "expense"},
        {"amount": -7000, "category": "Groceries", "description": "Groceries", "date": "2026-02-05", "type": "expense"},
        {"amount": -4000, "category": "Utilities", "description": "Electricity", "date": "2026-02-07", "type": "expense"},
        {"amount": -5000, "category": "Investment", "description": "SIP", "date": "2026-02-08", "type": "investment"},
    ],
}


def _post(client: TestClient, payload: dict):
    response = client.post("/api/agents/process", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_process_contract_minimal_profile():
    with TestClient(app) as client:
        data = _post(
            client,
            {
                "user_input": "Show me my spending pattern this month",
                "user_profile": MINIMAL_PROFILE,
            },
        )

        parsed = ProcessResponse.model_validate(data)
        assert parsed.success is True
        assert parsed.final_output.strip()
        assert parsed.plan.executive_summary.strip()


def test_process_contract_full_profile():
    with TestClient(app) as client:
        data = _post(
            client,
            {
                "user_input": "Create a comprehensive financial plan for me",
                "user_profile": PROFILE_WITH_TRANSACTIONS,
            },
        )

        parsed = ProcessResponse.model_validate(data)
        assert parsed.success is True
        assert parsed.analysis_type
        assert parsed.plan.key_metrics is not None


def test_process_contract_no_profile_education_path():
    with TestClient(app) as client:
        data = _post(
            client,
            {
                "user_input": "What is inflation?",
                "user_profile": None,
            },
        )

        parsed = ProcessResponse.model_validate(data)
        assert parsed.success is True
        assert parsed.final_output.strip()
        assert parsed.plan.executive_summary.strip()


GOLDEN_PROMPTS = [
    # Income/expense analysis
    "Show me my spending pattern this month",
    "Analyze my cash flow and tell me where I'm overspending",
    "Summarize my income vs expenses",
    "Which categories are my biggest expenses?",
    "Detect anomalies in my transactions",
    # Budget planning
    "Create a monthly budget for me",
    "Help me reduce my monthly expenses",
    "How much should I save each month for my goals?",
    "Build a 12-month roadmap to improve my finances",
    "Recommend a savings plan",
    # Investment advice
    "Optimize my investment portfolio",
    "What should my asset allocation be?",
    "Suggest a diversified portfolio for moderate risk",
    "How should I start investing as a beginner?",
    "Is SIP a good idea for me?",
    # Debt optimization
    "Help me pay off my credit card debt faster",
    "Should I use avalanche or snowball method?",
    "Create a debt payoff strategy for my loans",
    "How can I reduce interest costs on my debt?",
    "What's my debt-to-income ratio and what to do about it?",
    # Comprehensive / mixed
    "Analyze my finances and create a full plan",
    "Give me a comprehensive financial strategy",
    "Can you create a plan balancing debt payoff and investing?",
    "I want to improve my overall financial health",
    "Provide a holistic plan for the next 12 months",
    # Education-only intent
    "What is tax?",
    "Explain diversification",
    "What is an emergency fund and why do I need it?",
    "Define compound interest",
    "Why is inflation important?",
]


def test_process_contract_golden_prompts_validate_schema():
    assert len(GOLDEN_PROMPTS) >= 30

    with TestClient(app) as client:
        for prompt in GOLDEN_PROMPTS:
            data = _post(
                client,
                {
                    "user_input": prompt,
                    "user_profile": PROFILE_WITH_TRANSACTIONS,
                    "options": {"narrative": False},
                },
            )
            parsed = ProcessResponse.model_validate(data)
            assert parsed.final_output.strip()
            assert parsed.plan.executive_summary.strip()
