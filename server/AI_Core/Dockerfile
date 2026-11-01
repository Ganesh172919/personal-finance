FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 finwise
RUN mkdir -p /app/data && chown finwise:finwise /app/data
COPY --chown=finwise:finwise . .
USER finwise
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4)"
CMD ["uvicorn", "api_service:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers"]
