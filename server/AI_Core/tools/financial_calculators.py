r"""
tools/financial_calculators.py - Financial Calculation Utilities
================================================================

Provides ``FinancialCalculators``, a collection of static methods for
common financial calculations used by the specialist agents.

Calculations provided
---------------------
- **Compound interest** -- supports annual, monthly, quarterly, and
  daily compounding frequencies.
- **Loan amortisation** -- monthly payment, total interest, and total
  payment for a fixed-rate loan.
- **Debt snowball** -- month-by-month payoff simulation for the
  snowball method (smallest balance first).
- **Retirement projection** -- future value of current savings plus
  monthly contributions at an expected return rate.
- **Risk profile assessment** -- weighted scoring across age, experience,
  time horizon, and risk tolerance.

MINDMAP FLOW
------------
::

    FinancialCalculators Static Toolset
    ├── 1. Compound Interest Engine (calculate_compound_interest)
    │   ├── Frequency Resolution: annual (1), monthly (12), quarterly (4), daily (365)
    │   ├── Formula: A = P * (1 + r/n)^(n*t)
    │   └── Outputs: future_value, total_interest, effective_rate
    ├── 2. Loan Amortization Engine (calculate_loan_payment)
    │   ├── Fixed-rate Annuity Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    │   └── Outputs: monthly_payment, total_payment, total_interest
    ├── 3. Debt Snowball Simulator (calculate_debt_snowball)
    │   ├── Smallest Balance First Prioritization
    │   ├── Rollover Payment Reallocation upon Payoff
    │   └── Month-by-month Schedule & Debt-free Date
    ├── 4. Retirement Horizon Model (calculate_retirement_needs)
    │   ├── Current Corpus Growth + Monthly SIP Accumulation
    │   └── Target Nest Egg vs Projected Capital Comparison
    └── 5. Risk Profile Classifier (assess_risk_profile)
        ├── Multi-factor Scoring: Age (30%), Horizon (25%), Tolerance (25%), Experience (20%)
        └── Returns RiskProfile: CONSERVATIVE | MODERATE | AGGRESSIVE

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |             Financial Calculation Request (Static)            |
    +-------------------------------+-------------------------------+
                                    |
            +-----------------------+-----------------------+
            |           |                   |               |
            v           v                   v               v
       [Compound      [Loan Amortization] [Debt Snowball] [Risk Assessment]
        Interest]               |                   |               |
            |                   |                   |               |
            v                   v                   v               v
       Calculate FV       Annuity Formula     Rollover Loop    Weighted Sum
       A = P(1+r/n)^nt    M = P[r(1+r)^n]/..  Smallest balance Age/Horizon/Risk
            |                   |                   |               |
            \                   |                   |              /
             \                  |                   |             /
              v                 v                   v            v
    +---------------------------------------------------------------+
    | Return Standardized Metric Dictionary / Enum Value            |
    +---------------------------------------------------------------+

The ``RiskProfile`` enum (conservative/moderate/aggressive) is used
by the ``InvestmentAdvisorAgent`` to determine portfolio allocation.
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List


class RiskProfile(str, Enum):
    """Investor risk profile classification."""

    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"

class FinancialCalculators:
    """Financial calculation utilities.

    All methods are static -- no instance state is needed.
    """
    
    @staticmethod
    def calculate_compound_interest(principal: float, rate: float, years: int, 
                                  compounding: str = "annual") -> Dict[str, float]:
        """Calculate compound interest with different compounding periods"""
        if principal <= 0 or years <= 0:
            return {
                "final_amount": max(0.0, round(principal, 2)),
                "interest_earned": 0.0,
                "total_contributions": max(0.0, round(principal, 2))
            }

        compounding_factors = {
            "annual": 1,
            "monthly": 12,
            "quarterly": 4,
            "daily": 365
        }
        
        n = compounding_factors.get(compounding, 1)
        rate_decimal = rate / 100
        amount = principal * (1 + rate_decimal/n) ** (n * years)
        interest_earned = amount - principal
        
        return {
            "final_amount": round(amount, 2),
            "interest_earned": round(interest_earned, 2),
            "total_contributions": principal
        }
    
    @staticmethod
    def calculate_loan_payment(principal: float, annual_rate: float, years: int) -> Dict[str, float]:
        """Calculate monthly loan payment using amortization formula"""
        if principal <= 0 or years <= 0:
            return {
                "monthly_payment": 0.0,
                "total_interest": 0.0,
                "total_payment": 0.0
            }

        monthly_rate = annual_rate / 100 / 12
        n_payments = years * 12
        
        if monthly_rate == 0:
            monthly_payment = principal / n_payments
        else:
            monthly_payment = principal * (monthly_rate * (1 + monthly_rate) ** n_payments) / ((1 + monthly_rate) ** n_payments - 1)
        
        total_payment = monthly_payment * n_payments
        total_interest = max(0.0, total_payment - principal)
        
        return {
            "monthly_payment": round(monthly_payment, 2),
            "total_interest": round(total_interest, 2),
            "total_payment": round(total_payment, 2)
        }
    
    @staticmethod
    def calculate_debt_snowball(debts: List[Dict]) -> List[Dict]:
        """Calculate debt snowball repayment plan"""
        if not debts:
            return []
            
        # Sort by balance (snowball method - smallest balance first)
        sorted_debts = sorted(debts, key=lambda x: x.get('balance', 0))
        
        # Calculate payoff timeline
        extra_payment = 100  # Assume $100 extra payment
        current_month = 0
        
        for debt in sorted_debts:
            balance = debt.get('balance', 0)
            if balance <= 0:
                debt['payoff_months'] = 0
                debt['payoff_date'] = FinancialCalculators._calculate_future_date(current_month)
                continue

            min_payment = debt.get('minimum_payment', balance * 0.03)
            interest_rate = debt.get('interest_rate', 0) / 100 / 12
            
            months = 0
            is_unpayable = False
            while balance > 0 and months < 600:  # 50-year safety limit
                interest = balance * interest_rate
                payment = min_payment + extra_payment
                
                # Check for negative amortization (payment <= interest)
                if payment <= interest and balance > 0:
                    is_unpayable = True
                    break

                if payment > balance + interest:
                    payment = balance + interest
                
                balance = balance + interest - payment
                months += 1
            
            if is_unpayable or (months >= 600 and balance > 0):
                debt['payoff_months'] = None
                debt['payoff_date'] = "Indefinite (payment covers only interest or less)"
                debt['unpayable'] = True
            else:
                debt['payoff_months'] = months
                debt['payoff_date'] = FinancialCalculators._calculate_future_date(current_month + months)
                current_month += months
                
                # Add extra payment to next debt only when current debt is paid off
                if len(sorted_debts) > sorted_debts.index(debt) + 1:
                    extra_payment += min_payment
        
        return sorted_debts
    
    @staticmethod
    def calculate_retirement_savings(current_age: int, retirement_age: int, current_savings: float,
                                   monthly_contribution: float, expected_return: float) -> Dict[str, float]:
        """Calculate retirement savings projection"""
        years_to_retirement = max(0, retirement_age - current_age)
        months_to_retirement = years_to_retirement * 12
        
        if months_to_retirement == 0:
            return {
                "projected_savings": round(max(0.0, current_savings), 2),
                "total_contributions": round(max(0.0, current_savings), 2),
                "growth_earned": 0.0
            }

        monthly_rate = expected_return / 100 / 12
        future_value = current_savings * (1 + monthly_rate) ** months_to_retirement

        # Future value of contributions
        if monthly_contribution > 0:
            if monthly_rate == 0:
                # No growth — contributions don't compound
                future_value += monthly_contribution * months_to_retirement
            else:
                future_value += monthly_contribution * ((1 + monthly_rate) ** months_to_retirement - 1) / monthly_rate
        
        total_contributions = current_savings + (monthly_contribution * months_to_retirement)
        return {
            "projected_savings": round(future_value, 2),
            "total_contributions": round(total_contributions, 2),
            "growth_earned": round(max(0.0, future_value - total_contributions), 2)
        }
    
    @staticmethod
    def assess_risk_profile(age: int, investment_experience: str, time_horizon: int, 
                          risk_tolerance: str) -> RiskProfile:
        """Assess investor risk profile"""
        score = 0
        
        # Age factor
        if age < 30:
            score += 3
        elif age < 50:
            score += 2
        else:
            score += 1
        
        # Experience factor
        experience_map = {"none": 0, "beginner": 1, "intermediate": 2, "expert": 3}
        score += experience_map.get(investment_experience.lower(), 1)
        
        # Time horizon factor
        if time_horizon > 10:
            score += 3
        elif time_horizon > 5:
            score += 2
        else:
            score += 1
        
        # Risk tolerance factor
        tolerance_map = {"low": 0, "medium": 1, "high": 2}
        score += tolerance_map.get(risk_tolerance.lower(), 1)
        
        if score >= 8:
            return RiskProfile.AGGRESSIVE
        elif score >= 5:
            return RiskProfile.MODERATE
        else:
            return RiskProfile.CONSERVATIVE
    
    @staticmethod
    def _calculate_future_date(months_from_now: int) -> str:
        """Calculate future date given months from now"""
        future_date = datetime.now() + timedelta(days=months_from_now * 30)
        return future_date.strftime("%Y-%m-%d")