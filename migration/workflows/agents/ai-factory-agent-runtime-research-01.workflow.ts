import { workflow, trigger, node, newCredential, languageModel, expr } from '@n8n/workflow-sdk';

const research_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6, config: { id: '42b2eed7-a045-47ae-b894-86d237912e95', name: 'Research Model', parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-4-6', cachedResultName: 'Claude Sonnet 4.6' }, options: { maxTokensToSample: 1024 } }, credentials: { anthropicApi: newCredential('Gateway credits') } } });

const runtime_In = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { id: '1864727e-42b7-4c04-83c3-7bdb44e00b5e', name: 'Runtime In', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'task_id', type: 'number' }, { name: 'agent_code', type: 'string' }, { name: 'test_fail_memory', type: 'boolean' }] } } }
});

const validate_Input = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '30014088-426e-4183-b37f-f86b1e4b227d',
    name: 'Validate Input',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const j = $('Runtime In').first().json;
const rawTask = j.task_id;
const taskNum = Number(rawTask);
const taskValid = rawTask !== null && rawTask !== undefined && rawTask !== '' && Number.isInteger(taskNum) && taskNum > 0;
const agent = (j.agent_code == null) ? '' : String(j.agent_code).trim();
const agentValid = agent.length > 0;
const valid = taskValid && agentValid;
const errs = [];
if (!taskValid) errs.push('invalid_task_id');
if (!agentValid) errs.push('invalid_agent_code');
return [{ json: { task_id: taskValid ? taskNum : rawTask, agent_code: agent, valid: valid, validation_error: errs.length ? errs.join(',') : null } }];
`
    }
  }
});

const input_Valid = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: 'b31e8681-311d-49d0-a67d-50f78207765b', name: 'Input Valid?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c-valid', leftValue: expr('{{ $json.valid }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const load_Ctx = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'a3f5af35-761f-4a82-8911-00bac79a92e9',
    name: 'Load Ctx',
    parameters: {
      operation: 'executeQuery',
      query: `
WITH t AS (SELECT * FROM ai_core.tasks WHERE id = $1::bigint),
     a AS (SELECT * FROM ai_core.agents WHERE agent_code = $2),
     v AS (SELECT version, model, prompt FROM ai_core.agent_versions
           WHERE agent_id = (SELECT id FROM a) AND is_active = true
           ORDER BY created_at DESC LIMIT 1),
     l AS (SELECT id FROM ai_core.agent_leases
           WHERE agent_id = (SELECT id FROM a) AND task_id = $1::bigint AND status = 'active'
           ORDER BY acquired_at DESC LIMIT 1)
SELECT json_build_object(
  'task_exists', (SELECT count(*) FROM t) > 0,
  'task_status', (SELECT status FROM t),
  'objective', (SELECT objective FROM t),
  'required_capabilities', (SELECT required_capabilities FROM t),
  'agent_id', (SELECT id FROM a),
  'agent_status', (SELECT status FROM a),
  'version', (SELECT version FROM v),
  'model', (SELECT model FROM v),
  'prompt', (SELECT prompt FROM v),
  'has_active_lease', (SELECT count(*) FROM l) > 0,
  'lease_id', (SELECT id FROM l),
  'capability_ok', COALESCE((SELECT 'web_research' = ANY(required_capabilities) FROM t), false),
  'objective_present', COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false),
  'runnable', (
     (SELECT count(*) FROM t) > 0
     AND COALESCE((SELECT status FROM a) = 'active', false)
     AND NOT COALESCE((SELECT emergency_stopped FROM a), false)
     AND COALESCE((SELECT 'web_research' = ANY(required_capabilities) FROM t), false)
     AND COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false)
     AND (SELECT count(*) FROM l) > 0
     AND COALESCE((SELECT status FROM t) NOT IN ('completed','cancelled'), false)
  ),
  'reason', CASE
     WHEN (SELECT count(*) FROM t) = 0 THEN 'task_not_found'
     WHEN NOT COALESCE((SELECT status FROM a) = 'active', false) THEN 'agent_inactive'
     WHEN COALESCE((SELECT emergency_stopped FROM a), false) THEN 'agent_emergency_stop'
     WHEN NOT COALESCE((SELECT 'web_research' = ANY(required_capabilities) FROM t), false) THEN 'capability_mismatch'
     WHEN NOT COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false) THEN 'missing_objective'
     WHEN (SELECT count(*) FROM l) = 0 THEN 'no_active_lease'
     WHEN COALESCE((SELECT status FROM t) IN ('completed','cancelled'), false) THEN 'task_closed'
     ELSE NULL END
) AS ctx;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ $json.task_id }},{{ $json.agent_code }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const runnable = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '63866da3-6e52-4b12-9215-7b34cda74fdc', name: 'Runnable?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c-run', leftValue: expr('{{ $json.ctx.runnable }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const start_Task = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'df34c10d-19d6-4d92-8501-9ec5fe9d804c',
    name: 'Start Task',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks
   SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
 WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'started', jsonb_build_object('by', $3));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($3, 'task_started', 'task', $1::text, jsonb_build_object('status','running'));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $(\'Runtime In\').item.json.agent_code ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const sanitize_Input = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '12aa3569-c4aa-493f-b61e-909c67fc97c3',
    name: 'Sanitize Input',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const raw = ($('Load Ctx').first().json.ctx.objective == null) ? '' : String($('Load Ctx').first().json.ctx.objective);
const patterns = [
  /Bearer\\s+[A-Za-z0-9._\\-]+/gi,
  /\\bsk-[A-Za-z0-9]{12,}\\b/g,
  /\\bAKIA[0-9A-Z]{16}\\b/g,
  /\\beyJ[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+/g,
  /(api[_-]?key|apikey|password|passwd|secret|token)\\s*[:=]\\s*[^\\s'"]+/gi,
  /\\b[0-9a-fA-F]{32,}\\b/g
];
let out = raw;
for (const p of patterns) { out = out.replace(p, '[REDACTED]'); }
return [{ json: { sanitized_objective: out, input_redacted: out !== raw } }];
`
    }
  }
});

const fail_Memory_test = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: 'b3c131ae-93e1-4b0f-b9c8-ca3a9558e5cf', name: 'Fail Memory? (test)', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-failmem', leftValue: expr('{{ $(\'Runtime In\').item.json.test_fail_memory }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const force_Memory_Outage_test = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '4c5467f1-65fb-4547-9e4f-2f68c9248732',
    name: 'Force Memory Outage (test)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
// TEST-ONLY controlled fault injection. Only reachable when Runtime In.test_fail_memory === true.
// Throws a REAL execution error to simulate the Memory Service dependency being unavailable,
// so the dependency-failure branch (audit + recovery + task->retrying) can be validated
// WITHOUT deactivating or mutating the published Memory Service.
throw new Error('memory_service_unavailable: injected dependency outage (test_fail_memory)');
`
    },
    onError: 'continueErrorOutput'
  }
});

const memory_Failure = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'b2c9fc52-5574-4c51-b759-631c4e6cd348',
    name: 'Memory Failure',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'retrying', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'dependency_failed', jsonb_build_object('dependency', 'memory_service', 'reason', $3));
INSERT INTO ai_core.recovery_events (incident_type, affected_entity, action_taken, status, data)
VALUES ('dependency_failure', 'task:' || $1::text, 'route_to_retry', 'pending', jsonb_build_object('agent', $4, 'dependency', 'memory_service', 'reason', $3));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'dependency_failed', 'task', $1::text, jsonb_build_object('dependency', 'memory_service', 'reason', $3, 'status', 'retrying'))
RETURNING id;
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, ($json.error && $json.error.message ? $json.error.message : \'memory_service_unavailable\'), $(\'Runtime In\').item.json.agent_code ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const dependency_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: '0c8a6f54-b82a-4166-8617-1e7ce7c1d8eb', name: 'Dependency Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'd1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'd2', name: 'status', type: 'string', value: 'dependency_failed' }, { id: 'd3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'd4', name: 'dependency', type: 'string', value: 'memory_service' }] } } }
});

const read_Memory = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { id: 'a6ee5b97-6656-45db-8c56-e8988ea0f781', name: 'Read Memory', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'YsrehnJIm5d1uxeU', cachedResultName: 'AI_FACTORY — Memory Service' }, workflowInputs: { mappingMode: 'defineBelow', value: { op: 'read', agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), scope: 'agent', key: '', content: '', metadata: '', task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}') }, matchingColumns: [], schema: [{ id: 'op', displayName: 'op', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'scope', displayName: 'scope', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'key', displayName: 'key', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'content', displayName: 'content', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'metadata', displayName: 'metadata', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const memory_Text = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: 'da2b52c3-ead3-4405-85f1-216ec5287735',
    name: 'Memory Text',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const r = $('Read Memory').first().json;
const items = Array.isArray(r.items) ? r.items : [];
const memory_text = items.length ? items.map((m) => '- ' + (m.content || '')).join('\\n') : '(no prior memory)';
return [{ json: { memory_count: items.length, memory_text: memory_text } }];
`
    }
  }
});

const call_Tool_Gateway = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { id: 'b2264c2f-9031-45ca-bbfe-c0ac0b8ab386', name: 'Call Tool Gateway', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'MvtXbc0zN7MZYyNC', cachedResultName: 'AI_FACTORY — Tool Gateway' }, workflowInputs: { mappingMode: 'defineBelow', value: { agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), capability_code: 'web_research', tool_code: 'tool_web_search', tool_input: expr('{{ $(\'Sanitize Input\').item.json.sanitized_objective }}'), task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}'), test_mode: expr('{{ false }}') }, matchingColumns: [], schema: [{ id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'capability_code', displayName: 'capability_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_code', displayName: 'tool_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_input', displayName: 'tool_input', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'test_mode', displayName: 'test_mode', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const tool_Failure = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'b6a4a806-029e-40f4-9890-14a58c6728fd',
    name: 'Tool Failure',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'retrying', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'tool_failed', jsonb_build_object('tool', 'tool_web_search', 'reason', $3));
INSERT INTO ai_core.recovery_events (incident_type, affected_entity, action_taken, status, data)
VALUES ('tool_failure', 'task:' || $1::text, 'route_to_retry', 'pending', jsonb_build_object('agent', $4, 'reason', $3));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'tool_failed', 'task', $1::text, jsonb_build_object('tool', 'tool_web_search', 'reason', $3, 'status', 'retrying'))
RETURNING id;
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, ($(\'Call Tool Gateway\').item.json.deny_reason || $(\'Call Tool Gateway\').item.json.error || \'gateway_unavailable\'), $(\'Runtime In\').item.json.agent_code ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const failed_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: '6d68f862-dab3-4893-9c6c-20fce49e3d9c', name: 'Failed Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'f1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'f2', name: 'status', type: 'string', value: 'tool_failed' }, { id: 'f3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'f4', name: 'reason', type: 'string', value: expr('{{ $(\'Call Tool Gateway\').item.json.deny_reason || $(\'Call Tool Gateway\').item.json.error || \'gateway_unavailable\' }}') }] } } }
});

const gateway_OK = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '97b9fd04-b257-41ec-9a69-600cee0ecad9', name: 'Gateway OK?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-gw', leftValue: expr('{{ $json.allowed }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const compact_Sources = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: 'b4e60d80-1825-4673-b7e7-e29d0fddf4e9',
    name: 'Compact Sources',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const gw = $input.first().json || {};
const brave = Array.isArray(gw.results) ? gw.results[0] : gw.results;
let web = [];
if (brave && brave.web && Array.isArray(brave.web.results)) web = brave.web.results;
if (web.length === 0 && brave && brave.discussions && Array.isArray(brave.discussions.results)) {
  web = brave.discussions.results;
}
const strip = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/\\s+/g, ' ').trim().slice(0, 300);
const sources = web.slice(0, 6).map((r) => ({ title: r.title || '', url: r.url || '', description: strip(r.description) }));
const sources_text = sources.map((s, i) => '[' + (i + 1) + '] ' + s.title + '\\n' + s.url + '\\n' + s.description).join('\\n\\n');
return [{ json: { allowed: gw.allowed === true, tool_code: gw.tool_code || null, audit_id: gw.audit_id || null, source_count: sources.length, sources, sources_text } }];
`
    }
  }
});

const build_Prompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '91de90ff-327b-486f-ac97-ef99df07a7d4',
    name: 'Build Prompt',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const ctx = $('Load Ctx').first().json.ctx;
const mem = $('Memory Text').first().json.memory_text;
const sources = $('Compact Sources').first().json.sources_text;
const objective = $('Sanitize Input').first().json.sanitized_objective;
const prompt = 'You are ' + (ctx.prompt || 'a research agent') + '\\n\\n'
  + 'PRIOR AGENT MEMORY (research_01):\\n' + mem + '\\n\\n'
  + 'OBJECTIVE:\\n' + objective + '\\n\\n'
  + 'Use ONLY these web sources:\\n' + sources + '\\n\\n'
  + 'Write a concise research brief (5-8 sentences) that answers the objective and cites sources by [n]. '
  + 'If prior memory is relevant, explicitly build on it. If sources are insufficient, say so.';
return [{ json: { prompt: prompt } }];
`
    }
  }
});

const synthesize = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { id: '0f60b47e-6844-4f83-81b0-7f71772c1ad6', name: 'Synthesize', parameters: { promptType: 'define', text: expr('{{ $(\'Build Prompt\').item.json.prompt }}') }, subnodes: { model: research_Model } }
});

const build_Output = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '352c3a5a-d464-496f-9c7d-26c1e15de561',
    name: 'Build Output',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const patterns = [
  /Bearer\\s+[A-Za-z0-9._\\-]+/gi,
  /\\bsk-[A-Za-z0-9]{12,}\\b/g,
  /\\bAKIA[0-9A-Z]{16}\\b/g,
  /\\beyJ[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+/g,
  /(api[_-]?key|apikey|password|passwd|secret|token)\\s*[:=]\\s*[^\\s'"]+/gi,
  /\\b[0-9a-fA-F]{32,}\\b/g
];
const redact = function (s) { let o = (s == null ? '' : String(s)); for (const p of patterns) { o = o.replace(p, '[REDACTED]'); } return o; };
const summaryRaw = ($input.first().json.text) || '';
const summary = redact(summaryRaw);
const compact = $('Compact Sources').first().json;
const objective = $('Sanitize Input').first().json.sanitized_objective;
const out = {
  objective: objective,
  summary: summary,
  source_count: compact.source_count,
  sources: compact.sources,
  memory_used: $('Memory Text').first().json.memory_count,
  input_redacted: $('Sanitize Input').first().json.input_redacted,
  gateway_audit_id: compact.audit_id,
  generated_at: new Date().toISOString(),
};
return [{ json: { output_json: JSON.stringify(out), summary_len: summary.length, source_count: compact.source_count } }];
`
    }
  }
});

const save_Result = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '3e722510-6b5f-4eed-a6fd-b26d15428d77',
    name: 'Save Result',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.task_results (task_id, agent_id, capability_code, output, status, score)
VALUES ($1::bigint, $2::bigint, 'web_research', $3::jsonb, NULL, NULL)
RETURNING id;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $json.output_json ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const event_Result = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'e406c960-031d-48c3-8506-527183ba43db',
    name: 'Event Result',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'qc', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'result_saved', jsonb_build_object('task_result_id', $3::bigint, 'status', 'awaiting_qc'));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'task_result_saved', 'task_result', $3::text, jsonb_build_object('task_id', $1::bigint, 'status', 'awaiting_qc'));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $(\'Save Result\').item.json.id, $(\'Runtime In\').item.json.agent_code ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const runtime_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: 'acacb98e-72f2-42cf-b5e7-a46cfc9e8ede', name: 'Runtime Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'r1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 'r2', name: 'task_result_id', type: 'number', value: expr('{{ $(\'Save Result\').item.json.id }}') }, { id: 'r3', name: 'status', type: 'string', value: 'awaiting_qc' }, { id: 'r4', name: 'source_count', type: 'number', value: expr('{{ $(\'Build Output\').item.json.source_count }}') }, { id: 'r5', name: 'summary_len', type: 'number', value: expr('{{ $(\'Build Output\').item.json.summary_len }}') }] } } }
});

const audit_Blocked = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '7d7d7e19-3929-47fc-96e9-42210953ff4a',
    name: 'Audit Blocked',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($1, 'runtime_blocked', 'task', $2, jsonb_build_object('reason', $3))
RETURNING id;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.agent_code, ($(\'Runtime In\').item.json.task_id + \'\'), $(\'Load Ctx\').item.json.ctx.reason ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const blocked_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: 'fa5fc052-d3f7-4525-9a91-e2c9eb12181b', name: 'Blocked Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'b1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'b2', name: 'reason', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.reason }}') }, { id: 'b3', name: 'task_status', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.task_status }}') }] } } }
});

const audit_Invalid = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '9db71e50-bd36-4ec8-9fd7-64ee799e9f32',
    name: 'Audit Invalid',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($1, 'runtime_input_rejected', 'task', $2, jsonb_build_object('reason', $3, 'status', 'rejected'))
RETURNING id;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ [ ($(\'Runtime In\').item.json.agent_code + \'\'), ($(\'Runtime In\').item.json.task_id + \'\'), $(\'Validate Input\').item.json.validation_error ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const invalid_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: 'b53282eb-4b08-4fd8-be6b-7b127dd995da', name: 'Invalid Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'i1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'i2', name: 'reason', type: 'string', value: expr('{{ $(\'Validate Input\').item.json.validation_error }}') }, { id: 'i3', name: 'status', type: 'string', value: 'rejected' }] } } }
});

const wf = workflow('TVV1eh8EwohRL2BD', 'AI_FACTORY — Agent Runtime (research_01)', { executionOrder: 'v1', executionTimeout: 60, errorWorkflow: 'MeClArVW55egSVsM' });

export default wf
  .add(runtime_In)
  .to(validate_Input)
  .to(input_Valid.onTrue(load_Ctx
    .to(runnable.onTrue(start_Task
      .to(sanitize_Input)
      .to(fail_Memory_test.onTrue(force_Memory_Outage_test
        .onError(memory_Failure
        .to(dependency_Out))).onFalse(read_Memory
        .onError(memory_Failure)
        .to(memory_Text)
        .to(call_Tool_Gateway
        .onError(tool_Failure
        .to(failed_Out)))
        .to(gateway_OK.onTrue(compact_Sources
          .to(build_Prompt)
          .to(synthesize)
          .to(build_Output)
          .to(save_Result)
          .to(event_Result)
          .to(runtime_Out)).onFalse(tool_Failure))))).onFalse(audit_Blocked
      .to(blocked_Out)))).onFalse(audit_Invalid
    .to(invalid_Out)))
  .group('Validate input', [validate_Input, input_Valid], { description: 'Детерминированно проверяет task_id и agent_code до загрузки контекста' })
  .group('Reject input', [audit_Invalid, invalid_Out], { description: 'Невалидный/malformed вход: пишет причину в audit_logs и возвращает отказ вызывающему' })
  .group('Load & authorize', [load_Ctx, runnable], { description: 'Загружает задачу, агента, активную версию и активный lease; решает, можно ли выполнять' })
  .group('Execute research', [start_Task, sanitize_Input, fail_Memory_test, force_Memory_Outage_test, read_Memory, memory_Failure, dependency_Out, memory_Text, call_Tool_Gateway, gateway_OK, compact_Sources, build_Prompt, synthesize, research_Model, build_Output, save_Result, event_Result, runtime_Out, tool_Failure, failed_Out], { description: 'Реальный web_research через Tool Gateway → Brave, синтез LLM, сохранение результата; при отказе/ошибке шлюза уходит в retry-ветку с recovery и au' })
  .group('Blocked', [audit_Blocked, blocked_Out], { description: 'Задача не выполняется: фиксирует причину блокировки в audit_logs и возвращает её вызывающему' })