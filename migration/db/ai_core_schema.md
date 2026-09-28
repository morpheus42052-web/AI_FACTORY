# AI_FACTORY — PostgreSQL Source Schema Export

Source: live PostgreSQL via read-only introspection (execution 1375, workflow `zWU3xchTGE4NnLQ4`, SELECT-only). No DDL/DML executed.
Credential: `AI_FACTORY Postgres` (`7j4vPc4PQWPU29kM`) — **password NOT exported (secret)**.
pgvector extension version: **0.8.2**.

## Object summary
- Tables total: **31** (ai_core: 29, ai_vector: 2)
- Indexes: 74 · Primary keys: 31 · Foreign keys: 25 · Unique constraints: 11 · Check constraints: 15 · Triggers: 8 · Views: 0
- HNSW vector indexes: `ai_vector.idx_knowledge_vectors_embedding_hnsw`, `ai_vector.idx_memory_vectors_embedding_hnsw` (vector_cosine_ops, `vector(1536)`)
- `updated_at` trigger (`trg_set_updated_at` -> `ai_core.set_updated_at()`) on: agents, knowledge_sources, managers, memory, system_config, system_state, tasks, workflows

## Functions (6, all owner=postgres, SECURITY INVOKER, PUBLIC EXECUTE)
- `ai_core.reserve_agent(p_task_id, p_agent_id, p_ttl_seconds=30, p_attempt)` -> jsonb — sole queued->assigned lease authority
- `ai_core.release_lease(...)`, `ai_core.expire_leases(...)`
- `ai_core.set_agent_emergency_stop(...)`, `ai_core.clear_agent_emergency_stop(...)` — actor guard p_actor IN ('human','governor')
- `ai_core.set_updated_at()` — trigger function
> Full function bodies not re-exported (documented in GAP-TOP-005 verification). Re-export via pg_get_functiondef if exact body needed.

## Sequences
31 sequences (29 ai_core + 2 ai_vector), all `<table>_id_seq`, owner postgres, used as column DEFAULT nextval() (NOT IDENTITY). Every INSERT path must grant sequence USAGE.

## tasks 13-status CHECK
created, planned, queued, assigned, running, qc, completed, failed, retrying, blocked, paused, cancelled, escalated.

## ai_vector (pgvector) — vector(1536)
- knowledge_vectors: id; source_id FK->ai_core.knowledge_sources(id); chunk_index; content; embedding vector(1536); metadata; created_at. HNSW cosine index.
- memory_vectors: id; scope; owner_code; content; embedding vector(1536); metadata; created_at. HNSW cosine index.

## NOT exported (secrets / data)
- PostgreSQL password (credential secret) — user supplies in local `.env`.
- Row data (audit_logs, tasks, memory, etc.) — schema only; not exported. Registry reference rows are in ai_core_seed.sql.

> Full narrative schema (all 29 ai_core tables column-by-column) also available in the reconstruction DDL: database/ai_core_restore.sql.
