# N8N -> GITHUB EXPORT REPORT

**Scope:** Export ONLY of the AI_FACTORY project from n8n to GitHub. No local runtime, no Gemini, no PHASE 6, no architecture change, no deletions, no workflow deactivation, no production PostgreSQL change, no production publish.

**Source:** n8n `neo15.app.n8n.cloud`, project MVP (`Z4KTCxjCrMStefSZ`) · **Export date:** 2026-09-29

## Verification chain: n8n source -> exported files -> git -> GitHub

### Workflows
- TOTAL WORKFLOWS (n8n): 80
- EXPORTED WORKFLOWS: 80 (81 files; register-agent-selector dual-placed, counted once)
- MISSING WORKFLOWS: 0
- 41 published + 39 draft. Includes ALL draft, inactive, test/fixture, legacy, empty and duplicate workflows.
- Empty/duplicate flagged: 01_GOVERNOR (vgLeDMQOv9l7EgrK) empty shell (0 nodes) + duplicate name of canonical Governor (Xwt2lhpjVSGy8phT). 4 obsolete Selector variants + superseded Governor v1 under legacy_duplicates/.
- Each workflow exported as TypeScript SDK source preserving nodes, connections, parameters, expressions, settings, triggers, sub-workflow refs, error handlers, credential references, node types, node config, webhook & schedule config.

### Agents
- TOTAL: 8 · EXPORTED: 8 · MISSING: 0 (research_01, factcheck_01, analyst_01, writer_01, editor_01, seo_01, qc_01, orchestrator_01)
- qc_01 = QC-as-service (no runtime workflow). Registry model claude-sonnet-4-6 for 7; anthropic/claude-sonnet-5 for qc_01.

### Managers: 4 / 4 (analytics, content, distribution, research)
### Capabilities/Routing: 16 defined / 9 in use · 9 routing rows (is_primary=true; proficiency NULL)
### Permissions: 7 catalogue · 8 agent tool assignments (secrets excluded)
### Data Tables: 7 / 7 with rows (all ai_core mirrors)

### Database
- TOTAL DB OBJECTS: 31 tables (ai_core 29 + ai_vector 2), 6 functions, 8 triggers, 74 indexes, 31 sequences, 15 check constraints, 25 FK, 11 unique, pgvector vector(1536)
- EXPORTED: schema COMPLETE (restore + seed SQL); function BODIES PARTIAL (signatures + semantics documented)
- MISSING: function bodies (5 writing functions) — re-export with pg_get_functiondef()
- READ-ONLY introspection only. No CREATE/ALTER/DROP on production.

### LLM: provider (OmniRoute), base URL, model IDs, agent->model map, fallback/routing config. Secrets EXCLUDED. Embedding BLOCKED.
### Credentials: AI_FACTORY Postgres, AI_FACTORY OmniRoute (MVP), GitHub account, Brave Search (ref). Secrets EXCLUDED.
### Native n8n Agents: 3 (metadata only; internal config UNKNOWN, Agents-module owned).

## Repository
- Repository: morpheus42052-web/AI_FACTORY (private, pre-existing; reused)
- Branch: n8n-export-20260929

## Secrets scan
- No real secrets exported. All secret values = ENVIRONMENT_VARIABLE_REQUIRED.
- .gitignore excludes .env, *.key, *.pem, credentials, secrets, tokens, passwords.
- Two SYNTHETIC dummy values (sk-ABCD1234EFGH5678IJKL, Bearer abcdef0123456789xyz) appear inside test-fixture workflow source (a05-editor-fixture, a06-seo-fixture) — intentional fake payloads used by the workflows' own secret-detector tests, NOT real credentials. Preserved verbatim for faithful workflow export.

## Guarantees
- PRODUCTION CHANGES: NONE
- N8N CHANGES: NONE
- DATABASE CHANGES: NONE
- SECRETS EXPORTED: NO

## Missing / limitations
- PostgreSQL function bodies (5) not extracted from prod (documented)
- Native n8n Agent internal config UNKNOWN (Agents-module owned)
- OmniRoute base URL is an ephemeral Cloudflare tunnel (replace for durable restore)
- Embedding provider not configured (vector search parity blocked)
- af_agents.model mirror drift vs ai_core (ai_core authoritative)

## Errors
- None during export. GitHub Advanced Security secret-scanning API unavailable (GHAS not enabled); local pattern scan performed, no real secrets found.
