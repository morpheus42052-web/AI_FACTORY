# AI_FACTORY — Agents Export

Source: `ai_core` registry (authoritative, read-only) + `af_*` DataTable mirrors. 8 agents, 4 managers, 9 capabilities in use (16 defined).

## Registered agents (ai_core.agents — AUTHORITATIVE)

| id | agent_code | name | role | manager | model (registry) | version | status | health | max_conc | memory_scope | runtime workflow |
|----|-----------|------|------|---------|------------------|---------|--------|--------|----------|--------------|------------------|
| 1 | research_01 | Алекс | Research Agent | research_manager (4) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | TVV1eh8EwohRL2BD |
| 2 | factcheck_01 | Fact Checker | Fact Check Agent | research_manager (4) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | 90MPYIUVyoR9PrHf |
| 3 | analyst_01 | Analyst | Analytics Agent | analytics_manager (1) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | CPXEE1tOBmIr2Dan |
| 4 | writer_01 | Writer | Writing Agent | content_manager (2) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | GI59nAFYGkKqGZF3 |
| 5 | editor_01 | Editor | Editing Agent | content_manager (2) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | CKMjyonzBVYWnnFn |
| 6 | seo_01 | SEO Agent | SEO Agent | distribution_manager (3) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | 8A45fx270mqqyfxk |
| 7 | qc_01 | QC Agent | Quality Control Agent | content_manager (2) | anthropic/claude-sonnet-5 | 1.0 | active | healthy | 3 | agent | NONE (QC-as-service) |
| 8 | orchestrator_01 | Orchestrator | Orchestration Agent | analytics_manager (1) | claude-sonnet-4-6 | 1.0 | active | healthy | 3 | agent | e2ipVQKCD2DSDTw2 |

Notes:
- manager_id is FK -> ai_core.managers.id. All resolve.
- qc_01 registry model differs (anthropic/claude-sonnet-5); qc_01 has NO agent_runtime (per-agent QC services). Documented norm, not a defect.
- emergency_stopped=false for all 8. heartbeat static 2026-09-20T16:05Z = architecture norm.

## Managers (ai_core.managers)
| id | manager_code | name | status | allowed_capabilities | responsibilities |
|----|-------------|------|--------|----------------------|------------------|
| 1 | analytics_manager | Analytics Manager | active | data_analysis, task_planning, agent_orchestration | data analysis, task planning, orchestration, performance analysis |
| 2 | content_manager | Content Manager | active | copywriting, content_analysis, quality_control | writing, editing, content analysis, quality control |
| 3 | distribution_manager | Distribution Manager | active | seo | SEO, distribution, publishing prep, channel optimization |
| 4 | research_manager | Research Manager | active | web_research, fact_checking | research, information gathering, fact verification, source analysis |

## Capabilities (9 in use; 16 defined)
In use: agent_orchestration, content_analysis, copywriting, data_analysis, fact_checking, quality_control, seo, task_planning, web_research.
Defined-but-unused (7): image_generation, translation, summarization, data_extraction, memory_management, learning, system_monitoring.

## Tool permissions
research_01: tool_web_search, tool_read_kb; factcheck_01: tool_web_search, tool_read_kb; analyst_01: tool_data_read; writer_01: tool_write_content; editor_01: tool_write_content; seo_01: tool_seo; qc_01: tool_qc; orchestrator_01: tool_orchestrate.

## Agent prompts
System prompts + config live in ai_core.agent_versions (prompt, config jsonb) and in the runtime workflow "Build Prompt" nodes (exported .ts sources). Not dumped as flat files; re-export from ai_core.agent_versions if needed. NOT secrets.

## af_* DataTable mirrors (7 tables)
af_agents (model column shows anthropic/claude-sonnet-5, differs from ai_core), af_agent_versions, af_agent_health, af_routing, af_permissions, af_managers, af_capabilities. ai_core is authoritative on any conflict.
