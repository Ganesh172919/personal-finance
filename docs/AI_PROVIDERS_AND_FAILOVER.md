# FinWise — AI Providers and Failover

This document explains how the AI runtime selects providers, rotates keys, exposes health information, and falls back across multiple model vendors.

## Overview

The AI Core can route requests through several providers:

- Gemini
- OpenRouter
- Groq
- Grok (xAI)
- Together
- Mistral
- OpenAI
- DeepSeek

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

## Key pools

The runtime no longer assumes a single API key per provider.

Supported patterns:

- single key: `OPENROUTER_API_KEY=...`
- indexed keys: `OPENROUTER_API_KEY_1=...`, `OPENROUTER_API_KEY_2=...`
- array form: `OPENROUTER_API_KEYS=["key-one","key-two"]`

Each provider key can be tracked independently for:

- success rate
- average latency
- 429 rate-limit failures
- 403 access-denied failures
- 404 invalid-model failures
- cooldown state
- circuit-open state

Key rotation behavior:

1. choose a healthy key from the provider pool
2. record success/failure against that key
3. cool down or open the circuit for degraded keys
4. try the next healthy key before leaving the provider

This is especially important for OpenRouter, where multiple keys may have different quotas or temporary availability.

## Model fallback behavior

Each provider also has a model candidate list.

Runtime behavior:

1. Try the active provider with its preferred/default model.
2. If the upstream model returns a 404-style error, move to the next model for that provider.
3. If the provider fails more broadly, move to the next provider in the chain.

This gives the system four layers of resilience:

- model failover within a provider
- key failover within a provider
- provider failover across vendors
- deterministic fallback if all upstream LLM paths fail

## Model catalog

Model candidates are no longer limited to a short hardcoded list.

- The managed catalog is stored in `server/AI_Core/data/model_catalog.json`
- The runtime loads 100+ model entries with metadata such as capability, reasoning strength, speed tier, cost tier, context window, modality, and fallback rank
- Only configured providers are enabled for live routing

Task-aware routing can prioritize:

- fast/cheap models for routing and summarization
- stronger reasoning models for synthesis and complex analysis
- catalog entries with better recent health scores

## API keys

Each provider reads its own API key environment variable:

| Provider | Environment variable |
| --- | --- |
| Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_N`, `OPENROUTER_API_KEYS` |
| Groq | `GROQ_API_KEY` |
| Grok | `XAI_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |

## Health and status endpoints

The AI Core exposes:

- `GET /health`
- `GET /api/providers`
- `GET /api/ai/status`
- `GET /api/ai/models`
- `GET /api/ai/sessions`

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

`/api/ai/status` includes:

- active provider and fallback chain
- last active route snapshot
- key pool stats per provider
- model catalog summary
- model health summary
- session manager stats
- rate limiter state

The Express server proxies these upstream endpoints through app-facing `/ai-core/...` routes.

## UI visibility

The client dialog in `client/src/components/AiStatusDialog.tsx` shows:

- last AI response metadata
- AI Core health
- provider failover chain
- last active provider/model/key route
- key-pool health and fingerprints
- model health summary
- provider list and standby status
- server circuit-breaker state

This is the quickest place to confirm whether the runtime is using the provider you expect.

## Testing

Targeted provider-chain tests live in:

- `server/AI_Core/tests/test_provider_env.py`
- `server/AI_Core/tests/test_key_pool.py`
- `server/AI_Core/tests/test_llm_wrapper.py`

Run them with:

```bash
cd server/AI_Core
pytest tests/test_provider_env.py tests/test_key_pool.py tests/test_llm_wrapper.py
```

## Related files

- `server/AI_Core/utils/provider_registry.py`
- `server/AI_Core/utils/llm_wrapper.py`
- `server/AI_Core/api_service.py`
- `server/src/controllers/aiStatusController.ts`
- `client/src/components/AiStatusDialog.tsx`
