"""
vision/errors.py - Vision Module Exceptions
=============================================

Defines custom exceptions for the vision subsystem.  The primary
exception is ``VisionDependencyError``, raised when required OCR
libraries (OpenCV, PaddleOCR, PaddlePaddle) are not installed.

This allows the rest of the application to handle missing vision
dependencies gracefully (return 503 to the client) rather than
crashing at import time.
"""

from __future__ import annotations


# Custom exception raised when optional OCR dependencies are missing.
# Enables graceful handling and error responses across vision endpoints.
# Inherits from standard RuntimeError for runtime dependency checking.
class VisionDependencyError(RuntimeError):
    """Raised when optional OCR dependencies (OpenCV, PaddleOCR) are unavailable.

    Caught by the API endpoints to return HTTP 503 with a helpful message.
    """

