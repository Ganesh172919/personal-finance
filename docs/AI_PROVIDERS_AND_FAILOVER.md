# AI Providers and Failover

This document explains how the AI runtime selects providers, exposes health information, and falls back across multiple model vendors.

## Overview

The AI Core can route requests through several providers:

- Gemini
- OpenRouter
- Groq
- Grok (xAI)
- Together
- Mistral

Provider definitions live in `server/AI_Core/utils/provider_registry.py`. Runtime invocation and failover logic live in `server/AI_Core/utils/llm_wrapper.py`.

## How provider selection works

The runtime resolves a preferred provider in this order:

1. `LLM_PROVIDER` if explicitly set
2. The first configured provider in the default priority list
3. `gemini` as the final default when no provider key is configured

Default priority:

```text
gemini -> openrouter -> groq -> grok -> together -> mistral
```

You can override the order with `LLM_PROVIDER_PRIORITY`, using a comma-separated list of provider names.

Example:

```env
LLM_PROVIDER=openrouter
LLM_PROVIDER_PRIORITY=openrouter,gemini,groq,grok,together,mistral
```

## Provider chain behavior

The provider chain is built by `resolve_provider_chain(...)`.

- The preferred provider is always attempted first.
- Configured fallback providers are appended after it.
- Providers without API keys are skipped during invocation.
- If no provider key exists, the preferred provider is still returned so the system can emit a clear configuration error.

## Model fallback behavior

Each provider also has a model candidate list.

Runtime behavior:

1. Try the active provider with its preferred/default model.
2. If the upstream model returns a 404-style error, move to the next model for that provider.
3. If the provider fails more broadly, move to the next provider in the chain.

This gives the system two layers of resilience:

- Model failover within a provider
- Provider failover across vendors

## API keys

Each provider reads its own API key environment variable:

| Provider | Environment variable |
| --- | --- |
| Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Grok | `XAI_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

## Health and status endpoints

The AI Core exposes:

- `GET /health`
- `GET /api/providers`

`/health` includes:

- service status
- active provider display name
- default model
- resolved `provider_chain`
- request id

`/api/providers` includes:

- provider name
- display name
- whether it is configured
- whether it is active
- whether it is currently in the failover chain
- default model
- model candidates

The Express server aggregates those upstream endpoints in `server/src/controllers/aiStatusController.ts` and returns them through the app-facing AI status endpoint.

## UI visibility

The client dialog in `client/src/components/AiStatusDialog.tsx` shows:

- last AI response metadata
- AI Core health
- provider failover chain
- provider list and standby status
- server circuit-breaker state

This is the quickest place to confirm whether the runtime is using the provider you expect.

## Testing

Targeted provider-chain tests live in:

- `server/AI_Core/tests/test_provider_env.py`

Run them with:

```bash
cd server/AI_Core
pytest tests/test_provider_env.py
```

## Related files

- `server/AI_Core/utils/provider_registry.py`
- `server/AI_Core/utils/llm_wrapper.py`
- `server/AI_Core/api_service.py`
- `server/src/controllers/aiStatusController.ts`
- `client/src/components/AiStatusDialog.tsx`
