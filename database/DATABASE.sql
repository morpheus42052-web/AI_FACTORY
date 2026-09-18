CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS ai_core;
CREATE SCHEMA IF NOT EXISTS ai_vector;

CREATE TABLE IF NOT EXISTS ai_core.managers (
 id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.agents (
 id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT,
 manager_code TEXT REFERENCES ai_core.managers(code), model TEXT,
 status TEXT NOT NULL DEFAULT 'active', max_concurrency INT NOT NULL DEFAULT 1,
 memory_scope TEXT NOT NULL DEFAULT 'agent', permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.agent_versions (
 id BIGSERIAL PRIMARY KEY, agent_id BIGINT NOT NULL REFERENCES ai_core.agents(id),
 version TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', system_prompt TEXT,
 config JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(agent_id, version)
);
CREATE TABLE IF NOT EXISTS ai_core.capabilities (
 id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, description TEXT, enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS ai_core.agent_capabilities (
 agent_id BIGINT NOT NULL REFERENCES ai_core.agents(id), capability_id BIGINT NOT NULL REFERENCES ai_core.capabilities(id),
 quality_score NUMERIC(6,3) DEFAULT 0, speed_score NUMERIC(6,3) DEFAULT 0,
 cost_score NUMERIC(6,3) DEFAULT 0, success_rate NUMERIC(6,3) DEFAULT 0,
 PRIMARY KEY(agent_id, capability_id)
);
CREATE TABLE IF NOT EXISTS ai_core.tasks (
 id BIGSERIAL PRIMARY KEY, task_code TEXT UNIQUE NOT NULL, parent_task_id BIGINT REFERENCES ai_core.tasks(id),
 objective TEXT NOT NULL, task_type TEXT NOT NULL DEFAULT 'general', priority INT NOT NULL DEFAULT 50,
 created_by TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'created',
 input_data JSONB NOT NULL DEFAULT '{}'::jsonb, constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
 plan JSONB, retry_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.task_dependencies (
 task_id BIGINT NOT NULL REFERENCES ai_core.tasks(id), depends_on_task_id BIGINT NOT NULL REFERENCES ai_core.tasks(id),
 PRIMARY KEY(task_id, depends_on_task_id), CHECK(task_id <> depends_on_task_id)
);
CREATE TABLE IF NOT EXISTS ai_core.task_events (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT NOT NULL REFERENCES ai_core.tasks(id),
 event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.task_results (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT NOT NULL REFERENCES ai_core.tasks(id),
 agent_id BIGINT REFERENCES ai_core.agents(id), result JSONB NOT NULL DEFAULT '{}'::jsonb,
 success BOOLEAN, duration_ms BIGINT, cost NUMERIC(18,6), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.qc_results (
 id BIGSERIAL PRIMARY KEY, task_result_id BIGINT NOT NULL REFERENCES ai_core.task_results(id),
 status TEXT NOT NULL, score NUMERIC(6,3), issues JSONB NOT NULL DEFAULT '[]'::jsonb,
 missing_requirements JSONB NOT NULL DEFAULT '[]'::jsonb, fact_check_status TEXT, reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.decisions (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES ai_core.tasks(id), actor_type TEXT NOT NULL,
 actor_code TEXT, decision_type TEXT NOT NULL, rationale TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.agent_leases (
 agent_id BIGINT PRIMARY KEY REFERENCES ai_core.agents(id), task_id BIGINT REFERENCES ai_core.tasks(id),
 lease_until TIMESTAMPTZ NOT NULL, acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.agent_health (
 agent_id BIGINT PRIMARY KEY REFERENCES ai_core.agents(id), status TEXT NOT NULL DEFAULT 'healthy',
 heartbeat_at TIMESTAMPTZ, last_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.agent_metrics (
 id BIGSERIAL PRIMARY KEY, agent_id BIGINT REFERENCES ai_core.agents(id), task_id BIGINT REFERENCES ai_core.tasks(id),
 success BOOLEAN, quality_score NUMERIC(6,3), duration_ms BIGINT, cost NUMERIC(18,6),
 retry_count INT DEFAULT 0, failure_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.experiments (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, baseline_version TEXT, candidate_version TEXT,
 status TEXT NOT NULL DEFAULT 'draft', config JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.experiment_results (
 id BIGSERIAL PRIMARY KEY, experiment_id BIGINT NOT NULL REFERENCES ai_core.experiments(id),
 variant TEXT NOT NULL, sample_size INT DEFAULT 0, quality NUMERIC(6,3), success_rate NUMERIC(6,3),
 speed NUMERIC(18,6), cost NUMERIC(18,6), retry_rate NUMERIC(6,3), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.learning_events (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES ai_core.tasks(id), agent_id BIGINT REFERENCES ai_core.agents(id),
 lesson TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.memory (
 id BIGSERIAL PRIMARY KEY, scope_type TEXT NOT NULL, scope_code TEXT, content TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.knowledge_sources (
 id BIGSERIAL PRIMARY KEY, source_uri TEXT UNIQUE NOT NULL, content_hash TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_vector.knowledge_vectors (
 id BIGSERIAL PRIMARY KEY, source_id BIGINT REFERENCES ai_core.knowledge_sources(id),
 chunk_text TEXT NOT NULL, embedding vector(1536), metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS ai_core.workflows (
 id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, active BOOLEAN DEFAULT false,
 version TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS ai_core.tool_permissions (
 id BIGSERIAL PRIMARY KEY, agent_code TEXT NOT NULL, tool_code TEXT NOT NULL,
 allowed BOOLEAN NOT NULL DEFAULT false, rate_limit_per_minute INT DEFAULT 60,
 UNIQUE(agent_code, tool_code)
);
CREATE TABLE IF NOT EXISTS ai_core.approvals (
 id BIGSERIAL PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
 requested_by TEXT, status TEXT NOT NULL DEFAULT 'pending', decision_by TEXT, reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ai_core.recovery_events (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES ai_core.tasks(id), error_class TEXT NOT NULL,
 action TEXT NOT NULL, attempt INT DEFAULT 0, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.audit_logs (
 id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL, actor_type TEXT, actor_code TEXT,
 task_id BIGINT REFERENCES ai_core.tasks(id), payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.system_alerts (
 id BIGSERIAL PRIMARY KEY, severity TEXT NOT NULL, alert_type TEXT NOT NULL, message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_core.system_state (
 id BOOLEAN PRIMARY KEY DEFAULT true, mode TEXT NOT NULL DEFAULT 'normal',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT
);
INSERT INTO ai_core.system_state(id,mode) VALUES(true,'normal') ON CONFLICT(id) DO NOTHING;

INSERT INTO ai_core.managers(code,name) VALUES
('research_manager','Research Manager'),('content_manager','Content Manager'),
('analytics_manager','Analytics Manager'),('distribution_manager','Distribution Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO ai_core.capabilities(code) VALUES
('web_research'),('fact_checking'),('data_analysis'),('copywriting'),('content_analysis'),('seo'),('image_generation'),('translation'),('summarization'),('quality_control'),('data_extraction'),('task_planning'),('agent_orchestration'),('memory_management'),('learning'),('system_monitoring')
ON CONFLICT(code) DO NOTHING;
