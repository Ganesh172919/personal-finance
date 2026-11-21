"""Calculate clearly specified compound-interest examples using the finance tool."""

import re

from tools.financial_calculators import FinancialCalculators

_EXAMPLE = re.compile(
    r"(?:answer briefly[.!]\s+)?(?:please\s+)?(?:(?:explain|calculate|illustrate)\s+)?"
    r"compound interest\s+(?:(?:using|with|on|for)\s+)?(?:a hypothetical(?: example of)?|hypothetical example of)\s+"
    r"(?:(?P<prefix>₹|\$|INR\s+|USD\s+))?(?P<principal>\d[\d,]*(?:\.\d{1,2})?)"
    r"(?:\s*(?P<suffix>rupees|dollars|INR|USD))?"
    r"\s+(?:earns?|at)\s+(?P<rate>\d{1,3}(?:\.\d{1,4})?)\s*(?:%|percent)"
    r"\s+(?:per year|annually)(?:\s+compounded\s+(?P<frequency>annually|monthly|quarterly|daily))?"
    r"\s+for\s+(?P<years>\d{1,2}|one|two|three|four|five)\s+years?"
    r"(?:\s+in one sentence)?[?.!]*",
    re.I,
)
_CHANGE_YEARS = re.compile(r"^(?:(?:and )?(?:what|how) about |and )after (\d{1,2}|one|two|three|four|five) years?[?.!]*$", re.I)
_CHANGE_RATE = re.compile(r"^(?:and )?what if (?:it|the rate) (?:were|was) (\d{1,3}(?:\.\d{1,4})?)\s*(?:%|percent)(?: instead)?[?.!]*$", re.I)
_YEAR_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
_FREQUENCY = {"annually": "annual", "monthly": "monthly", "quarterly": "quarterly", "daily": "daily"}


def compound_interest_answer(question: str, earlier: list[str]) -> str | None:
    original = (earlier[0] if earlier else question).strip()
    # Use the calculator only when it can answer the entire turn.
    match = _EXAMPLE.fullmatch(original)
    if not match or not original.replace("₹", "").isascii():
        return None
    currencies = {
        "₹" if marker.strip().lower() in {"₹", "inr", "rupees"} else "$"
        for marker in (match["prefix"], match["suffix"]) if marker
    }
    if len(currencies) != 1:
        return None
    symbol = currencies.pop()
    principal = float(match["principal"].replace(",", ""))
    rate = float(match["rate"])
    years_text = match["years"].lower()
    for turn in [*earlier[1:], question] if earlier else []:
        if change := _CHANGE_YEARS.fullmatch(turn.strip()):
            years_text = change[1].lower()
        elif change := _CHANGE_RATE.fullmatch(turn.strip()):
            rate = float(change[1])
        else:
            return None
    years = _YEAR_WORDS[years_text] if years_text in _YEAR_WORDS else int(years_text)
    if not (0 < principal <= 1_000_000_000 and 0 <= rate <= 100 and 0 < years <= 50):
        return None
    frequency_word = (match["frequency"] or "annually").lower()
    result = FinancialCalculators.calculate_compound_interest(principal, rate, years, _FREQUENCY[frequency_word])
    ending = f"{symbol}{result['final_amount']:,.2f}".removesuffix(".00")
    interest = f"{symbol}{result['interest_earned']:,.2f}".removesuffix(".00")
    duration = f"{years} year{'s' if years != 1 else ''}"
    headline = f"After {duration}, the balance is **{ending}**, including **{interest}** in total interest."
    if earlier or re.search(r"\bone sentence\b", question, re.I):
        return headline
    initial = f"{symbol}{principal:,.2f}".removesuffix(".00")
    return (
        f"{headline}\n\n"
        f"The calculation starts with {initial} at {rate:g}% per year, compounded {frequency_word}. "
        "Compounding earns interest on the original amount and on the interest already added."
    )
