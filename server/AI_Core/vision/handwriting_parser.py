from __future__ import annotations

import re
from typing import Dict, List

from dateutil.parser import parse as parse_date

from .engine import OcrLine


_PERCENT_RE = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*%")
_DATE_LIKE_RE = re.compile(r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b")
_AMOUNT_RE = re.compile(
    r"(?P<sym>[\u20B9$\u20AC\u00A3])?\s*(?P<num>\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?P<suf>[kKmM])?"
)


def _normalize_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _parse_amounts(text: str) -> List[Dict]:
    results: List[Dict] = []
    for match in _AMOUNT_RE.finditer(text):
        raw = (match.group(0) or "").strip()
        symbol = match.group("sym")
        number = (match.group("num") or "").replace(" ", "").replace(",", "")
        suffix = (match.group("suf") or "").lower()

        try:
            value = float(number)
        except ValueError:
            continue

        if suffix == "k":
            value *= 1000
        elif suffix == "m":
            value *= 1_000_000

        currency = None
        if symbol == "\u20B9":
            currency = "INR"
        elif symbol == "$":
            currency = "USD"
        elif symbol == "\u20AC":
            currency = "EUR"
        elif symbol == "\u00A3":
            currency = "GBP"

        results.append({"value": float(value), "currency": currency, "raw": raw})

    return results


def _parse_percentages(text: str) -> List[float]:
    values: List[float] = []
    for match in _PERCENT_RE.finditer(text):
        try:
            values.append(float(match.group(1)))
        except ValueError:
            continue
    return values


def _parse_dates(text: str) -> List[str]:
    out: List[str] = []
    for match in _DATE_LIKE_RE.finditer(text):
        raw = match.group(0)
        try:
            dt = parse_date(raw, dayfirst=True, fuzzy=True)
            out.append(dt.date().isoformat())
        except ValueError:
            continue
    seen = set()
    unique: List[str] = []
    for date_value in out:
        if date_value in seen:
            continue
        seen.add(date_value)
        unique.append(date_value)
    return unique


def _extract_goal_candidates(text: str, amounts: List[Dict]) -> List[Dict]:
    lowered = text.lower()
    candidates: List[Dict] = []

    patterns = [
        ("Emergency Fund", ["emergency", "buffer"]),
        ("Savings Target", ["savings target", "save", "saving target", "savings goal", "goal"]),
        ("Debt Paydown", ["payoff", "debt", "loan"]),
    ]

    for name, keywords in patterns:
        if any(keyword in lowered for keyword in keywords):
            target = amounts[0]["value"] if amounts else None
            currency = amounts[0].get("currency") if amounts else None
            candidates.append({"name": name, "target": target, "currency": currency})
            break

    return candidates


def _extract_budget_adjustments(text: str, amounts: List[Dict]) -> List[Dict]:
    lowered = text.lower()
    adjustments: List[Dict] = []
    if "budget" not in lowered and "expense" not in lowered and "spend" not in lowered:
        return adjustments

    for amount in amounts[:3]:
        adjustments.append(
            {
                "description": "Budget-related amount detected",
                "amount": amount.get("value"),
                "currency": amount.get("currency"),
            }
        )
    return adjustments


def extract_handwriting(lines: List[OcrLine]) -> Dict:
    normalized_lines = [OcrLine(text=_normalize_ws(line.text), confidence=float(line.confidence)) for line in lines if line.text]
    raw_text = "\n".join(line.text for line in normalized_lines if line.text).strip()

    if not raw_text:
        return {
            "recognized_text": "",
            "confidence": {"overall": 0.0, "lines": []},
            "detected_values": {
                "amounts": [],
                "percentages": [],
                "dates": [],
                "goal_candidates": [],
                "budget_adjustments": [],
            },
            "warnings": ["No text detected."],
        }

    overall = sum(line.confidence for line in normalized_lines) / max(1, len(normalized_lines))
    lines_conf = [{"text": line.text, "confidence": float(line.confidence)} for line in normalized_lines]

    flat = " ".join(line.text for line in normalized_lines)
    amounts = _parse_amounts(flat)
    percentages = _parse_percentages(flat)
    dates = _parse_dates(flat)
    goal_candidates = _extract_goal_candidates(flat, amounts)
    budget_adjustments = _extract_budget_adjustments(flat, amounts)

    return {
        "recognized_text": raw_text,
        "confidence": {"overall": float(overall), "lines": lines_conf},
        "detected_values": {
            "amounts": amounts,
            "percentages": percentages,
            "dates": dates,
            "goal_candidates": goal_candidates,
            "budget_adjustments": budget_adjustments,
        },
        "warnings": [],
    }
