from vision.engine import OcrLine
from vision.receipt_parser import extract_receipt


def test_extract_receipt_basic_fields():
    lines = [
        OcrLine(text="ACME SUPERMARKET", confidence=0.92),
        OcrLine(text="Date: 12/02/2026", confidence=0.88),
        OcrLine(text="Milk 55.00", confidence=0.81),
        OcrLine(text="Bread 40.00", confidence=0.80),
        OcrLine(text="Total 95.00", confidence=0.90),
    ]

    parsed = extract_receipt(lines, currency_hint="INR")
    extracted = parsed["extracted"]
    confidence = parsed["confidence"]

    assert extracted["vendor"] == "ACME SUPERMARKET"
    assert extracted["date"] == "2026-02-12"
    assert extracted["total"] == 95.0
    assert extracted["currency"] == "INR"
    assert isinstance(extracted["items"], list)
    assert confidence["total"] >= 0.5

