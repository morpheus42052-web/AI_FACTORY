# AI_FACTORY — OmniRoute / LLM Export

## Endpoint / provider
- OmniRoute gateway base: `https://dive-alt-avoiding-shopping.trycloudflare.com` (OpenAI-compatible; /v1/models, /v1/chat/completions).
- Transport: Cloudflare tunnel (trycloudflare) — ephemeral host (MIG-B05).
- n8n credential: `AI_FACTORY OmniRoute (MVP)` (7wsUxjPHigGMPX3M), type httpTemplatedCustomAuth, header Authorization: Bearer {{api_key}}. API key NOT exported (secret).
- Live-tested OK (execution 1362): GET /v1/models returned valid OpenAI-style list with ~130+ model IDs.

## Model families observed via /v1/models
auto/*, dva/claude-* (incl claude-sonnet-5), dva/gpt-5-*, dva/gemini-3-*, grok, kimi (~130 total).

## Runtime model per agent
research/factcheck/analyst/writer/editor/seo/orchestrator: claude-sonnet-4-6 (ai_core.agents.model). qc_01: anthropic/claude-sonnet-5 (QC-as-service, no runtime).

## Tool Gateway external integration
Tool Gateway (MvtXbc0zN7MZYyNC) web_search branch uses @brave/n8n-nodes-brave-search.braveSearch (secret not exported).

## Embedding provider
BLOCKED (MIG-B02): none configured. ai_vector.*.embedding = vector(1536) but NULL; only keyword search works.

## NOT exported
OmniRoute API key, Brave key, Postgres password — all secrets.
