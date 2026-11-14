# syntax=docker/dockerfile:1.7
# ---- builder: resolve wheels into an isolated venv ------------------------------
FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /build
COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---- runtime ----------------------------------------------------------------------
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    FINWISE_MEMORY_DB_PATH=/app/data/memory.sqlite3 \
    AI_CORE_MAX_INFLIGHT=6
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 finwise \
    && mkdir -p /app/data && chown finwise:finwise /app/data
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY --chown=finwise:finwise . .
USER finwise
EXPOSE 8001
# Liveness only: /health never touches the work gate. Orchestrators route on /ready.
HEALTHCHECK --interval=15s --timeout=4s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3)"
# One process per container (the work gate, rate limiter and LLM cache are per
# process); scale with replicas. SIGTERM -> lifespan drains in-flight work.
CMD ["uvicorn", "api_service:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--timeout-keep-alive", "65", "--timeout-graceful-shutdown", "60"]
