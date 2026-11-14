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


def test_calculate_loan_payment_edge_cases():
    zero_years = FinancialCalculators.calculate_loan_payment(principal=10000, annual_rate=5.0, years=0)
    assert zero_years["monthly_payment"] == 0.0

    zero_rate = FinancialCalculators.calculate_loan_payment(principal=12000, annual_rate=0.0, years=1)
    assert zero_rate["monthly_payment"] == 1000.0
    assert zero_rate["total_interest"] == 0.0


def test_calculate_compound_interest():
    normal = FinancialCalculators.calculate_compound_interest(principal=1000, rate=5.0, years=2)
    assert normal["final_amount"] > 1000
    assert normal["interest_earned"] > 0

    zero = FinancialCalculators.calculate_compound_interest(principal=0, rate=5.0, years=2)
    assert zero["final_amount"] == 0.0


def test_calculate_retirement_savings_edge_cases():
    # Already retired or retirement_age == current_age
    retired = FinancialCalculators.calculate_retirement_savings(
        current_age=65,
        retirement_age=65,
        current_savings=500000,
        monthly_contribution=1000,
        expected_return=7.0,
    )
    assert retired["projected_savings"] == 500000
    assert retired["growth_earned"] == 0.0

    # Zero percent return (no compounding growth)
    zero_growth = FinancialCalculators.calculate_retirement_savings(
        current_age=30,
        retirement_age=31,
        current_savings=10000,
        monthly_contribution=1000,
        expected_return=0.0,
    )
    assert zero_growth["projected_savings"] == 22000.0  # 10000 + 12 * 1000
    assert zero_growth["growth_earned"] == 0.0


def test_calculate_debt_snowball_edge_cases():
    debts = [
        {"balance": 1000, "interest_rate": 10.0, "minimum_payment": 50},
        {"balance": 5000, "interest_rate": 15.0, "minimum_payment": 150},
    ]
    result = FinancialCalculators.calculate_debt_snowball(debts)
    assert len(result) == 2
    assert result[0]["payoff_months"] is not None
    assert result[1]["payoff_months"] is not None

    # Unpayable debt where payment does not cover interest:
    # $10,000 at 24% annual interest generates $200/mo interest, but min payment is $50 and extra is 0
    unpayable_debts = [
        {"balance": 100000, "interest_rate": 30.0, "minimum_payment": 10}
    ]
    unpayable_result = FinancialCalculators.calculate_debt_snowball(unpayable_debts)
    assert unpayable_result[0]["payoff_months"] is None
    assert unpayable_result[0].get("unpayable") is True
