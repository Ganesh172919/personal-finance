"""
vision/receipt_parser.py - Receipt Field Extraction
=====================================================

Parses OCR output lines into structured receipt data using **heuristic
rules** (no ML model).  Extracts vendor name, date, total amount, tax,
line items, currency, and a suggested spending category.

Extraction pipeline
-------------------
1. **Vendor** -- pick the best candidate from the first 8 lines based
   on letter-to-digit ratio, length, and confidence.
2. **Date** -- regex match for YYYY-MM-DD or DD-MM-YYYY patterns.
3. **Total** -- scan for keywords like "grand total", "amount due";
   fall back to the maximum detected amount.
4. **Tax** -- scan for tax/GST/VAT keywords.
5. **Items** -- lines with an amount that are not totals/tax/discount.
6. **Currency** -- detect from currency symbols in the text.
7. **Category** -- keyword-based classification (food, groceries, etc.).

Design decisions
----------------
- Purely deterministic (no LLM calls) for speed and cost.
- Handles multiple currencies (INR, USD, EUR, GBP) via symbol detection.
- Limits extracted items to 30 to avoid huge payloads from noisy OCR.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from dateutil.parser import parse as parse_date

from .engine import OcrLine

_DATE_PATTERNS = [
    re.compile(r"\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b"),
    re.compile(r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b"),
]

_AMOUNT_RE = re.compile(
    r"(?P<sym>[\u20B9$\u20AC\u00A3])?\s*(?P<num>\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)"
)

_TOTAL_KEYWORDS = [
    "grand total",
    "amount due",
    "balance due",
    "total",
    "amount",
    "net",
]

_TAX_KEYWORDS = [
    "tax",
    "gst",
    "vat",
    "cgst",
    "sgst",
    "igst",
]

_IGNORE_ITEM_KEYWORDS = [
    "subtotal",
    "sub total",
    "total",
    "tax",
    "gst",
    "vat",
    "discount",
    "change",
    "round",
    "cash",
    "card",
    "visa",
    "mastercard",
    "upi",
]


# Normalizes multi-character whitespace into single spaces and strips margins.
# Preprocesses raw optical character line strings for regular expression parsing.
# Returns sanitized single-spaced text line strings.
def _normalize_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


# Parses numeric amounts and associated currency symbols from line text.
# Cleans thousand separators and commas to construct standard float numbers.
# Returns tuples of extracted float values, currency symbols, and raw strings.
def _parse_amounts(text: str) -> List[Tuple[float, Optional[str], str]]:
    matches: List[Tuple[float, Optional[str], str]] = []
    for m in _AMOUNT_RE.finditer(text):
        raw = m.group(0) or ""
        sym = m.group("sym")
        num = m.group("num") or ""
        num = num.replace(" ", "").replace(",", "")
        try:
            val = float(num)
        except Exception:
            continue
        matches.append((val, sym, raw.strip()))
    return matches


# Inspects OCR lines for currency symbols to deduce the receipt transaction currency.
# Matches currency signs including Indian rupee, US dollar, euro, and British pound.
# Falls back to the provided currency hint or defaults to INR if unmatched.
def _detect_currency(lines: List[OcrLine], currency_hint: str) -> str:
    joined = "\n".join(line.text for line in lines)
    if "\u20B9" in joined:
        return "INR"
    if "$" in joined:
        return "USD"
    if "\u20AC" in joined:
        return "EUR"
    if "\u00A3" in joined:
        return "GBP"
    return currency_hint or "INR"


# Searches receipt text lines for standard date formats using regular expressions.
# Employs fuzzy date parsing to convert matched strings into ISO date format.
# Returns a tuple containing the formatted date string and line confidence score.
def _parse_date(lines: List[OcrLine]) -> Tuple[Optional[str], float]:
    for line in lines:
        text = line.text
        for pat in _DATE_PATTERNS:
            m = pat.search(text)
            if not m:
                continue
            raw = m.group(0)
            try:
                dt = parse_date(raw, dayfirst=True, fuzzy=True)
                return dt.date().isoformat(), float(line.confidence)
            except Exception:
                continue
    return None, 0.0


# Evaluates candidate lines in the header section to identify the vendor name.
# Scores lines based on letter counts, casing, and absence of numeric noise.
# Returns the best-matching merchant name string along with its confidence score.
def _pick_vendor(lines: List[OcrLine]) -> Tuple[Optional[str], float]:
    candidates = lines[:8]
    best: Tuple[Optional[str], float] = (None, 0.0)
    for line in candidates:
        text = _normalize_ws(line.text)
        if not text or len(text) < 3:
            continue
        # Prefer text with letters, minimal digits, and not purely a date/amount line.
        letters = sum(ch.isalpha() for ch in text)
        digits = sum(ch.isdigit() for ch in text)
        if letters < 3:
            continue
        if digits > letters:
            continue
        if len(text) > 60:
            continue
        score = float(line.confidence) + (0.15 if text.isupper() else 0.0) + (0.1 if digits == 0 else 0.0)
        if score > best[1]:
            best = (text, score)
    return best


# Locates monetary values associated with specific target keywords like total or tax.
# Scans text lines matching given keyword phrases and extracts line maximums.
# Returns the extracted numerical amount and associated line confidence score.
def _find_keyword_amount(lines: List[OcrLine], keywords: List[str]) -> Tuple[Optional[float], float]:
    for kw in keywords:
        for line in lines:
            lowered = line.text.lower()
            if kw not in lowered:
                continue
            amounts = _parse_amounts(line.text)
            if not amounts:
                continue
            # pick max on that line
            value = max(a[0] for a in amounts)
            return value, float(line.confidence)
    return None, 0.0


# Finds the maximum numerical amount across all lines as a fallback total.
# Used when explicit total or balance keywords cannot be identified in receipt.
# Returns the highest detected float value and its line confidence rating.
def _fallback_max_amount(lines: List[OcrLine]) -> Tuple[Optional[float], float]:
    best_val: Optional[float] = None
    best_conf = 0.0
    for line in lines:
        amounts = _parse_amounts(line.text)
        if not amounts:
            continue
        val = max(a[0] for a in amounts)
        if best_val is None or val > best_val:
            best_val = val
            best_conf = float(line.confidence)
    return best_val, best_conf


# Extracts itemized purchase descriptions and amounts from receipt body lines.
# Filters out noise keywords, totals, tax entries, and tender payment lines.
# Returns lists of parsed item dictionaries and associated line confidences.
def _extract_items(lines: List[OcrLine]) -> Tuple[List[Dict], List[Dict]]:
    items: List[Dict] = []
    item_conf: List[Dict] = []

    for line in lines:
        text = _normalize_ws(line.text)
        lowered = text.lower()
        if not text:
            continue
        if any(kw in lowered for kw in _IGNORE_ITEM_KEYWORDS):
            continue
        amounts = _parse_amounts(text)
        if not amounts:
            continue
        # crude item line: "<desc> <amount>"
        value = max(a[0] for a in amounts)
        # Split description by removing the last amount match.
        last = list(_AMOUNT_RE.finditer(text))[-1]
        desc = _normalize_ws(text[: last.start()] if last else text)
        if not desc or len(desc) < 2:
            continue
        items.append(
            {
                "description": desc[:250],
                "total": float(value),
                "confidence": float(line.confidence),
            }
        )
        item_conf.append({"line": float(line.confidence)})

    # Limit to a reasonable number to avoid huge payloads.
    if len(items) > 30:
        items = items[:30]
        item_conf = item_conf[:30]
    return items, item_conf


# Heuristically determines spending category from merchant and item descriptions.
# Matches keywords against common spending classes like food, transit, and utilities.
# Returns the inferred category title string or defaults to Other.
def _suggest_category(vendor: Optional[str], items: List[Dict]) -> str:
    text = " ".join([vendor or ""] + [str(it.get("description", "")) for it in items]).lower()

    rules = [
        ("food", ["restaurant", "cafe", "coffee", "swiggy", "zomato", "pizza", "burger"]),
        ("groceries", ["supermarket", "grocery", "mart", "store", "fresh", "dmart", "reliance"]),
        ("transport", ["uber", "ola", "fuel", "petrol", "diesel", "parking", "toll"]),
        ("utilities", ["electric", "water", "gas", "broadband", "internet", "recharge"]),
        ("health", ["pharmacy", "medical", "clinic", "hospital", "lab"]),
        ("shopping", ["mall", "amazon", "flipkart", "clothing", "fashion"]),
    ]

    for category, keywords in rules:
        if any(k in text for k in keywords):
            return category.title()

    return "Other"


# Coordinates heuristic extraction of vendor, date, totals, items, and tax.
# Assembles parsed fields, computes individual confidences, and emits warnings.
# Returns comprehensive structured receipt dictionary for downstream accounting.
def extract_receipt(lines: List[OcrLine], *, currency_hint: str = "INR") -> Dict:
    """
    Heuristic receipt parsing from OCR lines.

    Returns:
      extracted: vendor/date/total/tax/items/raw_text/currency/category_suggestion
      confidence: per-field confidences
      warnings: list of strings
    """

    warnings: List[str] = []
    normalized_lines = [
        OcrLine(text=_normalize_ws(line.text), confidence=float(line.confidence)) for line in lines if line.text
    ]

    vendor, vendor_conf = _pick_vendor(normalized_lines)
    date_str, date_conf = _parse_date(normalized_lines)

    total, total_conf = _find_keyword_amount(normalized_lines, _TOTAL_KEYWORDS)
    if total is None:
        total, total_conf = _fallback_max_amount(normalized_lines)
        if total is not None:
            warnings.append("Total keyword not found; using max detected amount.")

    tax, tax_conf = _find_keyword_amount(normalized_lines, _TAX_KEYWORDS)

    items, item_conf = _extract_items(normalized_lines)
    currency = _detect_currency(normalized_lines, currency_hint)
    raw_text = "\n".join(line.text for line in normalized_lines if line.text)

    if vendor is None:
        warnings.append("Vendor not detected.")
    if date_str is None:
        warnings.append("Date not detected.")
    if total is None:
        warnings.append("Total amount not detected.")

    category_suggestion = _suggest_category(vendor, items)

    extracted = {
        "vendor": vendor,
        "date": date_str,
        "total": float(total) if total is not None else None,
        "tax": float(tax) if tax is not None else None,
        "currency": currency,
        "items": items,
        "raw_text": raw_text,
        "category_suggestion": category_suggestion,
    }

    confidence = {
        "vendor": float(min(1.0, max(0.0, vendor_conf))) if vendor is not None else 0.0,
        "date": float(min(1.0, max(0.0, date_conf))) if date_str is not None else 0.0,
        "total": float(min(1.0, max(0.0, total_conf))) if total is not None else 0.0,
        "tax": float(min(1.0, max(0.0, tax_conf))) if tax is not None else 0.0,
        "currency": 1.0 if currency else 0.0,
        "items": item_conf,
    }

    return {"extracted": extracted, "confidence": confidence, "warnings": warnings}

