from __future__ import annotations

import numpy as np

from .errors import VisionDependencyError


def decode_image(image_bytes: bytes) -> np.ndarray:
    try:
        import cv2  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise VisionDependencyError(
            "OpenCV is required for vision endpoints. Install opencv-python-headless."
        ) from exc

    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image payload")
    return img


def preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    """Light preprocessing to improve OCR robustness on receipts/photos."""
    try:
        import cv2  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise VisionDependencyError(
            "OpenCV is required for vision endpoints. Install opencv-python-headless."
        ) from exc

    if img is None:
        raise ValueError("Empty image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise + adaptive contrast.
    gray = cv2.fastNlMeansDenoising(gray, h=12)
    gray = cv2.equalizeHist(gray)

    # Otsu binarization helps printed receipts; handwriting is kept legible as well.
    _th, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # PaddleOCR expects 3-channel images in many cases; convert back to BGR.
    out = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    return out
