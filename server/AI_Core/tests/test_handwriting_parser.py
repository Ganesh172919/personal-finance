from vision.engine import OcrLine
from vision.handwriting_parser import extract_handwriting


def test_extract_handwriting_intent_amounts_and_percentages():
    lines = [
        OcrLine(text="savings target: ₹5000", confidence=0.72),
        OcrLine(text="increase savings by 10%", confidence=0.68),
        OcrLine(text="by 01/03/2026", confidence=0.60),
    ]

    parsed = extract_handwriting(lines)
    assert parsed["recognized_text"]
    detected = parsed["detected_values"]

    assert any(amount.get("value") == 5000.0 for amount in detected.get("amounts", []))
    assert 10.0 in detected.get("percentages", [])
    assert "2026-03-01" in detected.get("dates", [])
