from typing import Optional

from dotenv import load_dotenv
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from config import settings
from graph.state import FinancialGoal, UserProfile
from graph.workflow import create_financial_workflow
from utils import ColorFormatter, setup_logging

# Load environment variables first
load_dotenv()

# Initialize Windows-compatible color output if available
try:
    from colorama import init as colorama_init

    colorama_init(autoreset=True)
except Exception:
    pass


def _validate_provider_config() -> bool:
    try:
        settings.validate_api_key()
        return True
    except ValueError as exc:
        print(f"Warning: {exc}")
        print("Gemini narrative features are unavailable without GEMINI_API_KEY.")
        print("Continuing in deterministic mode (Gemini narrative features disabled).")
        return False


def _build_router_chain(gemini_available: bool, logger) -> Optional[object]:
    if not gemini_available:
        return None

    try:
        router_llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0,
            google_api_key=settings.GEMINI_API_KEY,
        )
        router_prompt = PromptTemplate.from_template(
            """Your job is to classify a user's question as either 'user_specific' or 'general'.
'user_specific' questions require personal context (like 'my income', 'my goals', 'my budget', 'should I...', 'analyze my...').
'general' questions are about financial concepts (like 'what is inflation?', 'explain mutual funds', 'how do stocks work?').

Respond with ONLY 'user_specific' or 'general'.

Question: {question}"""
        )
        print(ColorFormatter.info("Query router initialized..."))
        return router_prompt | router_llm | StrOutputParser()
    except Exception as exc:
        print(ColorFormatter.warning("Router unavailable. Continuing without Gemini router."))
        logger.error(f"Router initialization error: {exc}")
        return None


def create_sample_user_profile() -> UserProfile:
    goals = [
        FinancialGoal(name="Emergency Fund", target=15000, timeline_months=12, priority=1),
        FinancialGoal(name="Down Payment", target=50000, timeline_months=36, priority=2),
        FinancialGoal(name="Retirement Savings", target=100000, timeline_months=60, priority=3),
    ]

    transactions = [
        {"amount": 5000, "category": "Salary", "description": "Monthly salary", "date": "2024-01-01"},
        {"amount": -1500, "category": "Rent", "description": "Apartment rent", "date": "2024-01-02"},
        {"amount": -400, "category": "Groceries", "description": "Weekly groceries", "date": "2024-01-03"},
        {"amount": -200, "category": "Utilities", "description": "Electricity bill", "date": "2024-01-04"},
        {"amount": -300, "category": "Entertainment", "description": "Dining out", "date": "2024-01-05"},
        {"amount": -100, "category": "Transportation", "description": "Gas", "date": "2024-01-06"},
    ]

    debts = [
        {"name": "Student Loan", "balance": 25000, "interest_rate": 4.5, "minimum_payment": 300},
        {"name": "Credit Card", "balance": 5000, "interest_rate": 18.9, "minimum_payment": 150},
    ]

    return UserProfile(
        age=30,
        annual_income=75000,
        monthly_expenses=3500,
        savings=10000,
        debts=debts,
        financial_goals=goals,
        risk_tolerance="moderate",
        investment_experience="beginner",
        time_horizon=10,
        transactions=transactions,
    )


def main():
    logger = setup_logging()
    gemini_available = _validate_provider_config()
    router_chain = _build_router_chain(gemini_available, logger)

    print(ColorFormatter.header("FinWise AI Financial Assistant"))
    print("=" * 60)
    print(ColorFormatter.info("Initializing financial agents..."))

    try:
        workflow = create_financial_workflow()
        user_profile = create_sample_user_profile()

        print(ColorFormatter.success("\nWelcome to your AI Financial Assistant!"))
        print(ColorFormatter.info("I can help you with:"))
        print("- Income and expense analysis")
        print("- Budget planning and optimization")
        print("- Investment advice and portfolio management")
        print("- Debt optimization and repayment strategies")
        print("- Financial education and concept explanations")
        print("- Comprehensive financial planning")

        print(ColorFormatter.warning("\nSample User Profile Loaded:"))
        print(f"- Age: {user_profile.age}")
        print(f"- Income: ${user_profile.annual_income:,.2f}/year")
        print(f"- Savings: ${user_profile.savings:,.2f}")
        print(f"- Goals: {[goal.name for goal in user_profile.financial_goals]}")

        while True:
            print("\n" + "=" * 60)
            user_input = input(
                f"\n{ColorFormatter.info('How can I help you with your finances?')} "
                "(type 'quit' to exit)\n> "
            )

            if user_input.lower() in ["quit", "exit", "bye"]:
                print(ColorFormatter.success("Thank you for using FinWise Financial Assistant. Goodbye!"))
                break
            if not user_input.strip():
                continue

            profile_data = user_profile.model_dump()
            try:
                request_type = (
                    router_chain.invoke({"question": user_input})
                    if router_chain is not None
                    else "user_specific"
                )
                if "general" in str(request_type).lower():
                    print(ColorFormatter.info("Analyzing your general finance question."))
                    profile_data = None
                else:
                    print(ColorFormatter.info("Analyzing your request with your personal profile."))
            except Exception as exc:
                print(ColorFormatter.warning("Routing unavailable. Defaulting to user-specific analysis."))
                logger.error(f"Router classification error: {exc}")

            print(ColorFormatter.info("Processing with AI agents..."))
            try:
                result = workflow.process_request(user_input, profile_data)
                final_output = result.get("final_output", "I apologize, but I couldn't generate a response.")

                print(ColorFormatter.success("\nYour Financial Analysis:"))
                print("=" * 60)
                print(final_output)
                print("=" * 60)
            except Exception as exc:
                print(ColorFormatter.error(f"Sorry, I encountered an error: {exc}"))
                logger.error(f"Application error: {exc}")
                print("Please try again with a different question.")

    except Exception as exc:
        print(ColorFormatter.error(f"Failed to initialize financial agents: {exc}"))
        logger.error(f"Initialization error: {exc}")


if __name__ == "__main__":
    main()
