"""Compare two fixed-plus-per-unit prices using integer cents."""

import re
from decimal import Decimal

_PRICE = r"\d{1,9}(?:,\d{3}){0,2}(?:\.\d{1,2})?"
_REQUEST = re.compile(
    r"Compare two (?:hypothetical )?(?:shipping |pricing )?options for "
    r"(?P<count>\d{1,7}) (?P<unit>parcel|item|unit)s\.\s+"
    rf"Option A charges (?P<currency>₹|\$)(?P<a_fixed>{_PRICE}) plus "
    rf"(?P=currency)(?P<a_rate>{_PRICE}) per (?P=unit)\.\s+"
    rf"Option B charges (?P=currency)(?P<b_fixed>{_PRICE}) plus "
    rf"(?P=currency)(?P<b_rate>{_PRICE}) per (?P=unit)\.\s+"
    r"Give both totals, state which is cheaper and by how much, and find the first "
    r"whole (?P=unit) count where A becomes cheaper\.(?:\s+Show your arithmetic\.)?",
    re.IGNORECASE,
)


def flat_rate_comparison(question: str) -> str | None:
    match = _REQUEST.fullmatch(question.strip())
    if not match:
        return None

    a_fixed, a_rate, b_fixed, b_rate = (
        int(Decimal(match[key].replace(",", "")) * 100)
        for key in ("a_fixed", "a_rate", "b_fixed", "b_rate")
    )
    count = int(match["count"])
    unit = match["unit"].lower()
    currency = match["currency"]

    def money(cents: int) -> str:
        return f"{currency}{cents // 100:,}.{cents % 100:02d}".removesuffix(".00")

    a_total = a_fixed + a_rate * count
    b_total = b_fixed + b_rate * count
    difference = a_total - b_total
    if difference:
        cheaper = "A" if difference < 0 else "B"
        comparison = f"**Option {cheaper} is cheaper by {money(abs(difference))}.**"
    else:
        comparison = "**Both options cost the same.**"

    if a_fixed + a_rate < b_fixed + b_rate:
        first = 1
    elif b_rate > a_rate:
        first = (a_fixed - b_fixed) // (b_rate - a_rate) + 1
    else:
        first = None

    if first is None:
        threshold = "Option A is never cheaper at a positive whole count."
    else:
        a_first = a_fixed + a_rate * first
        b_first = b_fixed + b_rate * first
        threshold = (
            f"**Option A first becomes cheaper at {first:,} {unit}{'' if first == 1 else 's'}.** "
            f"At that count A costs {money(a_first)} and B costs {money(b_first)}."
        )

    return (
        f"- A: {money(a_fixed)} + {count:,} × {money(a_rate)} = **{money(a_total)}**\n"
        f"- B: {money(b_fixed)} + {count:,} × {money(b_rate)} = **{money(b_total)}**\n\n"
        f"{comparison}\n\n{threshold}"
    )
