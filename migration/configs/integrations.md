# AI_FACTORY — Integrations & Config Export

All secret VALUES excluded. Only references/shapes exported. Local runtime supplies real values via `.env`.

## External integrations
| Integration | Used by | n8n credential (ref only) | Type | Secret (NOT exported) |
|-------------|---------|---------------------------|------|------------------------|
| PostgreSQL (ai_core / ai_vector) | ~41 published workflows | `AI_FACTORY Postgres` (7j4vPc4PQWPU29kM) | postgres node | DB password |
| OmniRoute LLM gateway | 7 agent runtimes + Governor v1 draft | `AI_FACTORY OmniRoute (MVP)` (7wsUxjPHigGMPX3M) | httpTemplatedCustomAuth (Bearer) | API key |
| Brave Search | Tool Gateway (web_search branch) | Brave Search cred | @brave/n8n-nodes-brave-search | API key |

## Credential env-var mapping (values user-supplied)
```
AI_FACTORY_PG_HOST=
AI_FACTORY_PG_PORT=5432
AI_FACTORY_PG_DATABASE=
AI_FACTORY_PG_USER=
AI_FACTORY_PG_PASSWORD=          # SECRET — not exported
OMNIROUTE_BASE_URL=https://dive-alt-avoiding-shopping.trycloudflare.com   # ephemeral tunnel
OMNIROUTE_API_KEY=              # SECRET — not exported
BRAVE_SEARCH_API_KEY=           # SECRET — not exported
EMBEDDING_PROVIDER_API_KEY=     # BLOCKED: no provider configured
```

## Workflow-level settings observed (source-preserved in workflow files)
- `executionOrder: 'v1'` on all.
- `errorWorkflow: 'MeClArVW55egSVsM'` bound on 22 canonical workflows (Runtime Error Handler).
- `binaryMode: 'separate'` on 00_CORE_INTAKE and both Governors.
- research_01 runtime carries executionTimeout=60.

## Least-privilege DB roles (GAP-TOP-005, additive — created, NOT cut over)
10 NOLOGIN group roles exist: af_intake_writer, af_runtime, af_orchestration, af_governor_qc, af_readonly, af_knowledge_writer, af_metrics_writer, af_scheduler, af_audit_writer, af_func_owner. No LOGIN roles; postgres still the effective app role.
