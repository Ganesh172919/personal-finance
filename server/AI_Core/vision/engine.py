from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from importlib.util import find_spec
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .errors import VisionDependencyError
from .preprocess import decode_image, preprocess_for_ocr


@dataclass(frozen=True)
class OcrToken:
    text: str
    confidence: float
    box: List[List[float]]


@dataclass(frozen=True)
class OcrLine:
    text: str
    confidence: float


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        f = float(value)
        return f if f == f else default
    except Exception:
        return default


def get_vision_dependency_status() -> Dict[str, Any]:
    required_modules = {
        "cv2": "opencv-python-headless",
        "paddle": "paddlepaddle",
        "paddleocr": "paddleocr",
    }

    missing = [package for module, package in required_modules.items() if find_spec(module) is None]
    return {"ready": len(missing) == 0, "missing": missing}


@lru_cache(maxsize=8)
def _get_paddle_ocr(lang: str):
    # Heavy import is delayed to keep non-vision endpoints fast to import.
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise VisionDependencyError(
            "Vision OCR dependencies are unavailable. "
            "Install paddleocr and paddlepaddle (Python <3.13 recommended)."
        ) from exc

    return PaddleOCR(
        use_angle_cls=True,
        lang=lang,
        show_log=False,
        use_space_char=True,
    )


def _group_tokens_into_lines(tokens: List[OcrToken]) -> List[OcrLine]:
    if not tokens:
        return []

    # Sort top-to-bottom then left-to-right.
    def token_key(tok: OcrToken):
        box = tok.box or []
        xs = [p[0] for p in box if isinstance(p, list) and len(p) >= 2]
        ys = [p[1] for p in box if isinstance(p, list) and len(p) >= 2]
        x_min = min(xs) if xs else 0.0
        y_center = (min(ys) + max(ys)) / 2.0 if ys else 0.0
        return (y_center, x_min)

    sorted_tokens = sorted(tokens, key=token_key)

    # Estimate line-height threshold from token boxes.
    heights: List[float] = []
    for tok in sorted_tokens:
        box = tok.box or []
        ys = [p[1] for p in box if isinstance(p, list) and len(p) >= 2]
        if ys:
            heights.append(max(ys) - min(ys))
    median_height = float(np.median(np.array(heights))) if heights else 14.0
    y_threshold = max(10.0, 0.6 * median_height)

    lines: List[List[OcrToken]] = []
    current: List[OcrToken] = []
    current_y: Optional[float] = None

    for tok in sorted_tokens:
        box = tok.box or []
        ys = [p[1] for p in box if isinstance(p, list) and len(p) >= 2]
        y_center = (min(ys) + max(ys)) / 2.0 if ys else 0.0

        if current_y is None or abs(y_center - current_y) <= y_threshold:
            current.append(tok)
            current_y = y_center if current_y is None else (current_y * 0.8 + y_center * 0.2)
            continue

        lines.append(current)
        current = [tok]
        current_y = y_center

    if current:
        lines.append(current)

    grouped: List[OcrLine] = []
    for line_tokens in lines:
        # Left-to-right join.
        line_tokens_sorted = sorted(line_tokens, key=lambda t: min(p[0] for p in t.box) if t.box else 0.0)
        text = " ".join(t.text.strip() for t in line_tokens_sorted if t.text and t.text.strip()).strip()
        if not text:
            continue
        conf = float(np.mean([t.confidence for t in line_tokens_sorted])) if line_tokens_sorted else 0.0
        grouped.append(OcrLine(text=text, confidence=conf))

    return grouped


def ocr_image_to_lines(image_bytes: bytes, *, lang: str = "en") -> List[OcrLine]:
    """
    Run OCR and return normalized text lines.

    The engine is shared between receipt OCR and handwriting recognition.
    """
    dependency_status = get_vision_dependency_status()
    if not dependency_status["ready"]:
        missing = ", ".join(dependency_status["missing"])
        raise VisionDependencyError(
            "Vision OCR dependencies are unavailable. "
            f"Missing packages: {missing}."
        )

    img = decode_image(image_bytes)
    img = preprocess_for_ocr(img)

    # PaddleOCR accepts numpy arrays (BGR) directly.
    ocr = _get_paddle_ocr(lang)
    result = ocr.ocr(img, cls=True)

    tokens: List[OcrToken] = []
    if isinstance(result, list):
        for page in result:
            if not isinstance(page, list):
                continue
            for item in page:
                if not isinstance(item, list) or len(item) < 2:
                    continue
                box = item[0]
                text_conf = item[1]
                if not isinstance(text_conf, (list, tuple)) or len(text_conf) < 2:
                    continue
                text = str(text_conf[0] or "").strip()
                conf = _safe_float(text_conf[1], 0.0)
                if text:
                    tokens.append(OcrToken(text=text, confidence=conf, box=box))

    return _group_tokens_into_lines(tokens)
