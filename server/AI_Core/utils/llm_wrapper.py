"""
LLM Wrapper with built-in rate limiting and error handling.
Use this instead of direct ChatGoogleGenerativeAI calls.
"""

import logging
from typing import Dict, Any, List, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage

from config import settings
from utils.rate_limiter import (
    with_rate_limit_and_retry,
    get_rate_limiter_status,
    RateLimitError
)

logger = logging.getLogger(__name__)


class RateLimitedLLM:
    """
    A wrapper around ChatGoogleGenerativeAI that provides:
    - Automatic rate limiting
    - Retry with exponential backoff
    - Graceful error handling with fallback responses
    - Request logging and monitoring
    """
    
    def __init__(
        self,
        model: str = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        api_key: str = None
    ):
        self.model = model or settings.MODEL_NAME
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_key = api_key or settings.GEMINI_API_KEY
        
        self._llm = ChatGoogleGenerativeAI(
            model=self.model,
            temperature=self.temperature,
            google_api_key=self.api_key
        )
        
        # Track call statistics
        self._call_count = 0
        self._error_count = 0
        self._last_error = None
    
    @with_rate_limit_and_retry
    def invoke(
        self,
        messages: List[BaseMessage],
        fallback_response: Optional[str] = None
    ) -> Any:
        """
        Invoke the LLM with rate limiting and retries.
        
        Args:
            messages: List of messages to send to the LLM
            fallback_response: Optional fallback if all retries fail
            
        Returns:
            LLM response or fallback response
        """
        self._call_count += 1
        logger.debug(f"LLM call #{self._call_count} to {self.model}")
        
        try:
            response = self._llm.invoke(messages)
            return response
            
        except Exception as e:
            self._error_count += 1
            self._last_error = str(e)
            raise
    
    def invoke_with_fallback(
        self,
        messages: List[BaseMessage],
        fallback_response: str
    ) -> tuple[Any, bool]:
        """
        Invoke the LLM with a guaranteed fallback response.
        
        Args:
            messages: List of messages to send
            fallback_response: Response to return if LLM fails
            
        Returns:
            Tuple of (response, was_fallback_used)
        """
        try:
            response = self.invoke(messages)
            return response, False
        except RateLimitError as e:
            logger.warning(f"Rate limit hit, using fallback: {e}")
            return self._create_fallback_response(fallback_response), True
        except Exception as e:
            logger.error(f"LLM error, using fallback: {e}")
            return self._create_fallback_response(fallback_response), True
    
    def _create_fallback_response(self, content: str):
        """Create a mock response object for fallback scenarios."""
        class FallbackResponse:
            def __init__(self, text: str):
                self.content = text
        return FallbackResponse(content)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get call statistics for this LLM instance."""
        return {
            "model": self.model,
            "total_calls": self._call_count,
            "error_count": self._error_count,
            "success_rate": (
                (self._call_count - self._error_count) / self._call_count * 100
                if self._call_count > 0 else 100
            ),
            "last_error": self._last_error,
            "rate_limiter_status": get_rate_limiter_status()
        }


def create_llm(agent_type: str = "default") -> RateLimitedLLM:
    """
    Factory function to create a rate-limited LLM for a specific agent type.
    
    Args:
        agent_type: One of 'master', 'analyzer', 'planner', 'advisor', 'optimizer', 'educator'
        
    Returns:
        Configured RateLimitedLLM instance
    """
    config = settings.get_agent_config(agent_type)
    
    return RateLimitedLLM(
        model=settings.MODEL_NAME,
        temperature=config.get("temperature", 0.1),
        max_tokens=config.get("max_tokens", 1024)
    )


# Fallback responses for different agent types
FALLBACK_RESPONSES = {
    "analysis_type": "comprehensive",
    "financial_education": """
I apologize, but I'm currently experiencing high demand. Here's a brief explanation:

**General Financial Concepts:**
Financial literacy involves understanding how money works - earning, saving, investing, and protecting it. 
Key areas include:
- **Budgeting**: Tracking income vs expenses
- **Saving**: Building an emergency fund (3-6 months of expenses)
- **Investing**: Growing wealth through stocks, bonds, mutual funds
- **Debt Management**: Prioritizing high-interest debt repayment

Please try your specific question again in a few minutes for a more detailed, personalized response.
""",
    "budget_plan": """
While I'm currently unable to provide a personalized budget analysis, here's a general 50/30/20 guideline:
- **50% Needs**: Housing, utilities, groceries, insurance
- **30% Wants**: Entertainment, dining out, hobbies
- **20% Savings**: Emergency fund, investments, debt repayment

Please try again shortly for a customized budget plan.
""",
    "investment_advice": """
I'm temporarily unable to provide personalized investment recommendations. General principles:
- Start with an emergency fund (3-6 months expenses)
- Pay off high-interest debt first
- Diversify investments across asset classes
- Consider your risk tolerance and time horizon

Please retry for specific advice tailored to your situation.
""",
    "debt_optimization": """
While I can't analyze your specific debts right now, consider these strategies:
- **Avalanche Method**: Pay highest interest debts first (saves money)
- **Snowball Method**: Pay smallest debts first (psychological wins)
- Always pay minimums on all debts
- Consider consolidation for high-interest credit cards

Please try again for a personalized debt repayment plan.
""",
    "synthesis": """
I apologize, but I'm currently unable to generate a comprehensive financial plan.

**Recommended Next Steps:**
1. Review your monthly income and expenses
2. Identify areas where you can reduce spending
3. Build an emergency fund of 3-6 months expenses
4. Pay down high-interest debt
5. Start investing in diversified funds

Please try again shortly for a detailed, personalized plan.
"""
}


def get_fallback_response(response_type: str) -> str:
    """Get a fallback response for a specific type."""
    return FALLBACK_RESPONSES.get(response_type, FALLBACK_RESPONSES["synthesis"])
