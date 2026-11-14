# Observability assets

| File | What |
| --- | --- |
| `prometheus.yml` | Example scrape config (DNS service discovery of every `server` / `ai-core` replica). |
| `prometheus-rules.yml` | SLO recording rules, multi-window burn-rate alerts, platform alerts. |
| `grafana-dashboard.json` | "FinWise SLO and AI Platform" dashboard (import in Grafana, needs the rules loaded). |
| `compose.observability.yaml` | Optional Prometheus + Grafana overlay for local/staging. |

Enable the endpoints first: gateway `METRICS_ENABLED=true` + `METRICS_TOKEN`, AI Core
`AI_CORE_METRICS_TOKEN`. The edge (nginx) hides `/api/metrics`; scrape replicas directly.

Keep `deploy/observability/secrets/` out of git (it holds the scrape tokens): add
`deploy/observability/secrets/` to your local `.git/info/exclude`.

Details, metric catalogue and the list of defined-but-unwired metrics: `docs/OBSERVABILITY.md`.
Validation status: JSON/YAML parsed and PromQL brackets checked only; `promtool` and a real
Prometheus/Grafana were not available when these were written.
