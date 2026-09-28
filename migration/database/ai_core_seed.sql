-- =====================================================================
-- AI_FACTORY — ai_core registry SEED (reproducible reference data)
-- =====================================================================
-- Source: ai_core registry (authoritative) + af_* DataTable mirrors, read-only.
-- Run AFTER ai_core_restore.sql on a FRESH DB only. DO NOT run against production.
-- No secrets. Only registry/reference rows (managers, agents, capabilities,
-- routing, permissions, versions). Operational rows are runtime state, not seeded.
-- =====================================================================

INSERT INTO ai_core.managers (id, manager_code, name, domain, status) VALUES
  (1, 'analytics_manager',    'Analytics Manager',    'analytics',    'active'),
  (2, 'content_manager',      'Content Manager',      'content',      'active'),
  (3, 'distribution_manager', 'Distribution Manager', 'distribution', 'active'),
  (4, 'research_manager',     'Research Manager',     'research',     'active')
ON CONFLICT (manager_code) DO NOTHING;

INSERT INTO ai_core.agents
  (id, agent_code, name, role, manager_id, model, version, status, memory_scope,
   max_concurrency, current_load, quality_score, success_rate, speed_score,
   cost_score, failure_rate, retry_count, health_status, heartbeat_at) VALUES
  (1,'research_01','Алекс','Research Agent',4,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (2,'factcheck_01','Fact Checker','Fact Check Agent',4,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (3,'analyst_01','Analyst','Analytics Agent',1,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (4,'writer_01','Writer','Writing Agent',2,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (5,'editor_01','Editor','Editing Agent',2,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (6,'seo_01','SEO Agent','SEO Agent',3,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (7,'qc_01','QC Agent','Quality Control Agent',2,'anthropic/claude-sonnet-5','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z'),
  (8,'orchestrator_01','Orchestrator','Orchestration Agent',1,'claude-sonnet-4-6','1.0','active','agent',3,0,0.8,1,0.8,0.8,0,0,'healthy','2026-09-20T16:05:00Z')
ON CONFLICT (agent_code) DO NOTHING;

INSERT INTO ai_core.capabilities (id, capability_code, name, description) VALUES
  (1,'web_research','web_research','Web research and information gathering'),
  (2,'fact_checking','fact_checking','Fact verification and source analysis'),
  (3,'data_analysis','data_analysis','Data analysis'),
  (4,'copywriting','copywriting','Copywriting and content creation'),
  (5,'content_analysis','content_analysis','Content analysis and editing'),
  (6,'seo','seo','SEO optimization'),
  (7,'image_generation','image_generation','Image generation'),
  (8,'translation','translation','Translation and localization'),
  (9,'summarization','summarization','Summarization'),
  (10,'quality_control','quality_control','Quality control checks'),
  (11,'data_extraction','data_extraction','Data extraction'),
  (12,'task_planning','task_planning','Task planning and decomposition'),
  (13,'agent_orchestration','agent_orchestration','Agent orchestration'),
  (14,'memory_management','memory_management','Memory management'),
  (15,'learning','learning','Learning from results'),
  (16,'system_monitoring','system_monitoring','System monitoring')
ON CONFLICT (capability_code) DO NOTHING;

INSERT INTO ai_core.agent_capabilities (agent_id, capability_id, proficiency, is_primary) VALUES
  (1, 1, NULL, true), (2, 2, NULL, true), (3, 3, NULL, true), (4, 4, NULL, true),
  (5, 5, NULL, true), (6, 6, NULL, true), (7, 10, NULL, true), (8, 12, NULL, true), (8, 13, NULL, true)
ON CONFLICT (agent_id, capability_id) DO NOTHING;

INSERT INTO ai_core.tool_permissions (agent_id, tool_code, allowed) VALUES
  (1,'tool_web_search',true),(1,'tool_read_kb',true),
  (2,'tool_web_search',true),(2,'tool_read_kb',true),
  (3,'tool_data_read',true),(4,'tool_write_content',true),(5,'tool_write_content',true),
  (6,'tool_seo',true),(7,'tool_qc',true),(8,'tool_orchestrate',true)
ON CONFLICT DO NOTHING;

INSERT INTO ai_core.agent_versions (agent_id, version, model, is_active) VALUES
  (1,'1.0','claude-sonnet-4-6',true),(2,'1.0','claude-sonnet-4-6',true),(3,'1.0','claude-sonnet-4-6',true),
  (4,'1.0','claude-sonnet-4-6',true),(5,'1.0','claude-sonnet-4-6',true),(6,'1.0','claude-sonnet-4-6',true),
  (7,'1.0','anthropic/claude-sonnet-5',true),(8,'1.0','claude-sonnet-4-6',true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('ai_core.managers','id'),     (SELECT max(id) FROM ai_core.managers));
SELECT setval(pg_get_serial_sequence('ai_core.agents','id'),       (SELECT max(id) FROM ai_core.agents));
SELECT setval(pg_get_serial_sequence('ai_core.capabilities','id'), (SELECT max(id) FROM ai_core.capabilities));
