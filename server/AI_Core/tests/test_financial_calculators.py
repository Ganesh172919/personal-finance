from tools.financial_calculators import FinancialCalculators, RiskProfile


def test_assess_risk_profile_mapping():
    profile = FinancialCalculators.assess_risk_profile(
        age=28,
        investment_experience="expert",
        time_horizon=20,
        risk_tolerance="high",
    )

    assert profile == RiskProfile.AGGRESSIVE


def test_calculate_loan_payment_returns_positive_values():
    payment = FinancialCalculators.calculate_loan_payment(
        principal=500000,
        annual_rate=8.5,
        years=10,
    )

    assert payment["monthly_payment"] > 0
    assert payment["total_interest"] > 0
    assert payment["total_payment"] > payment["monthly_payment"]