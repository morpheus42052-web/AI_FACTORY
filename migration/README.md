# AI_FACTORY — n8n → GitHub Export

Reproducible source export of the **AI_FACTORY** control plane from n8n
(instance `neo15.app.n8n.cloud`, project **MVP** `Z4KTCxjCrMStefSZ`).

This is an **export only** — no local runtime, no execution, no Gemini, no PHASE 6.
Nothing in n8n or the production PostgreSQL was modified to produce it.

## Layout

```
migration/
├── workflows/          # 80 n8n workflows as TypeScript SDK source (+ workflows_index.json)
│   ├── control_plane/  ├── agents/   ├── qc/     ├── retry/
│   ├── services/       ├── db_utility/ ├── legacy_duplicates/ └── tests_fixtures/
├── agents/             # 8 agents (agents.json + agents_export.md)
├── managers/           # 4 managers (managers.json)
├── capabilities/       # capabilities + routing (capabilities.json)
├── permissions/        # tool permissions (tool_permissions.json)
├── database/           # ai_core_restore.sql, ai_core_seed.sql
├── db/                 # ai_core_schema.md (schema narrative)
├── data_tables/        # 7 af_* n8n Data Tables with rows (data_tables.json)
├── llm/                # llm_config.json + omniroute_llm.md (no secrets)
├── credentials/        # credential_references.json (references only, no secrets)
├── configs/            # integrations.md
├── native_agents/      # 3 native n8n Agent artifacts (metadata; config UNKNOWN)
└── docs/               # N8N_EXPORT_MANIFEST.md, N8N_EXPORT_REPORT.md
```

## Restoring the database (fresh DB only)

`database/ai_core_restore.sql` recreates the `ai_core` + `ai_vector` schema
(pgvector, `vector(1536)`), then `database/ai_core_seed.sql` loads the registry
reference data. **Never run these against production.** Function bodies are
documented but not reproduced verbatim — re-export with `pg_get_functiondef()`.

## Secrets

No secrets are in this repository. All secret values are replaced with
`ENVIRONMENT_VARIABLE_REQUIRED`. Supply real values via `.env` / the n8n
credential UI. See `credentials/credential_references.json` and `llm/llm_config.json`.

## Source of truth

`ai_core` PostgreSQL registry is authoritative. The `af_*` n8n Data Tables are
legacy mirrors (documented model drift on `af_agents.model` — `ai_core` wins).
