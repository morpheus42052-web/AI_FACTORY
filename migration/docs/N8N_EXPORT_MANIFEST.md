# N8N -> GITHUB EXPORT MANIFEST

Source instance: `neo15.app.n8n.cloud` · Project: MVP (`Z4KTCxjCrMStefSZ`)
Export date: 2026-09-29 · Mode: read-only export (no production/n8n/DB changes)

| Component | Source | Exported | Files | Status | Notes |
|-----------|--------|----------|-------|--------|-------|
| Workflows | n8n workflows(list) status=all | 80 / 80 | `workflows/**/*.workflow.ts` (81 files*), `workflows/workflows_index.json` | COMPLETE | 41 published, 39 draft. Full nodes/connections/parameters/expressions/settings/triggers as TypeScript SDK source. *register-agent-selector placed in 2 dirs (counted once). |
| Agents | ai_core.agents + af_agents | 8 / 8 | `agents/agents.json`, `agents/agents_export.md` | COMPLETE | qc_01 = QC-as-service (no runtime). |
| Managers | ai_core.managers + af_managers | 4 / 4 | `managers/managers.json` | COMPLETE | |
| Capabilities / Routing | ai_core + af_capabilities + af_routing | 16 defined / 9 in use, 9 routing rows | `capabilities/capabilities.json` | COMPLETE | is_primary=true; proficiency NULL |
| Tool permissions | ai_core.tool_permissions + af_permissions | 7 catalogue / 8 assignments | `permissions/tool_permissions.json` | COMPLETE | secrets excluded |
| PostgreSQL schema | read-only introspection | 31 tables, 6 funcs, 8 triggers, 74 idx, 31 seq | `database/ai_core_restore.sql`, `database/ai_core_seed.sql`, `db/ai_core_schema.md` | COMPLETE (schema) / PARTIAL (function bodies) | vector(1536) preserved |
| Data Tables | n8n data-tables(list) | 7 / 7 with rows | `data_tables/data_tables.json` | COMPLETE | all marked ai_core mirrors |
| LLM config | workflow LLM nodes + ai_core.model + /v1/models | full | `llm/llm_config.json`, `llm/omniroute_llm.md` | COMPLETE (no secrets) | OmniRoute; embedding BLOCKED |
| Credential references | n8n credentials(list) | 3 + 1 sub-integration | `credentials/credential_references.json` | COMPLETE (no secrets) | all secrets = ENVIRONMENT_VARIABLE_REQUIRED |
| Native n8n Agents | agents(list) | 3 (metadata) | `native_agents/native_agents.md` | PARTIAL | config Agents-module owned, UNKNOWN |
| Docs | this export | 2 required | `docs/` | COMPLETE | manifest + report |

## Completeness gates
- Workflows: 80 / 80 (0 missing)
- Agents: 8 / 8 (0 missing)
- Managers: 4 / 4
- Capabilities: 16 defined / 9 in use · Routing: 9 rows
- Permissions: 7 catalogue / 8 agent assignments
- Data Tables: 7 / 7
- DB objects: 31 tables, 6 functions (bodies partial), 8 triggers, 74 indexes, 31 sequences, vector(1536) — schema COMPLETE, function bodies PARTIAL
- LLM: exported without secrets
- Credentials: references exported / secrets excluded

## Not exported (by policy)
- All secret values -> ENVIRONMENT_VARIABLE_REQUIRED
- PostgreSQL function BODIES (signatures + semantics documented)
- Native n8n Agent internal configuration (Agents-module owned; UNKNOWN)
- Operational row data (tasks, audit_logs, leases, results, memory) — runtime state
