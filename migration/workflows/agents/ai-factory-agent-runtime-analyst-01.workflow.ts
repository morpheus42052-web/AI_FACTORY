import { workflow, trigger, node, newCredential, languageModel, expr } from '@n8n/workflow-sdk';

const analyst_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6, config: { id: '6a240b38-37ff-4379-8a7b-ea45268ca79b', name: 'Analyst Model', parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-4-6', cachedResultName: 'Claude Sonnet 4.6' }, options: { maxTokensToSample: 3000 } }, credentials: { anthropicApi: newCredential('Gateway credits') } } });

const runtime_In = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { id: '8b17356d-f232-4202-964a-219bb3f75604', name: 'Runtime In', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'task_id', type: 'number' }, { name: 'agent_code', type: 'string' }, { name: 'test_fail_memory', type: 'boolean' }, { name: 'test_fail_tool', type: 'boolean' }] } } }
});

const validate_Input = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '6540b9b9-6dc2-4bc1-a8ee-0cf5793a6134',
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
  config: { id: '134081f4-d1fd-4c8d-9892-5376152db024', name: 'Input Valid?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c-valid', leftValue: expr('{{ $json.valid }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const load_Ctx = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '78d64bd4-a181-4d63-9dea-91728a0a02ef',
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
  'agent_id', (SELECT id FROM a),
  'agent_status', (SELECT status FROM a),
  'model', (SELECT model FROM v),
  'prompt', (SELECT prompt FROM v),
  'has_active_lease', (SELECT count(*) FROM l) > 0,
  'capability_ok', COALESCE((SELECT 'data_analysis' = ANY(required_capabilities) FROM t), false),
  'objective_present', COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false),
  'runnable', (
     (SELECT count(*) FROM t) > 0
     AND COALESCE((SELECT status FROM a) = 'active', false)
     AND NOT COALESCE((SELECT emergency_stopped FROM a), false)
     AND COALESCE((SELECT 'data_analysis' = ANY(required_capabilities) FROM t), false)
     AND COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false)
     AND (SELECT count(*) FROM l) > 0
     AND COALESCE((SELECT status FROM t) NOT IN ('completed','cancelled'), false)
  ),
  'reason', CASE
     WHEN (SELECT count(*) FROM t) = 0 THEN 'task_not_found'
     WHEN NOT COALESCE((SELECT status FROM a) = 'active', false) THEN 'agent_inactive'
     WHEN COALESCE((SELECT emergency_stopped FROM a), false) THEN 'agent_emergency_stop'
     WHEN NOT COALESCE((SELECT 'data_analysis' = ANY(required_capabilities) FROM t), false) THEN 'capability_mismatch'
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
  config: { id: 'ca39c02b-4ef0-4aab-9dc1-b187530780a4', name: 'Runnable?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c', leftValue: expr('{{ $json.ctx.runnable }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const start_Task = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '92675b59-1ebd-45fe-aee8-5d438e8317b7',
    name: 'Start Task',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data) VALUES ($1::bigint, $2::bigint, 'started', jsonb_build_object('by', $3));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after) VALUES ($3, 'task_started', 'task', $1::text, jsonb_build_object('status','running'));
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
    id: '4ab0777d-c856-41c4-a233-c712a5c951a3',
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
return [{ json: { sanitized_question: out, input_redacted: out !== raw } }];
`
    }
  }
});

const fail_Memory_test = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '25b10537-35fd-4d76-bf27-cc3dbf3ad159', name: 'Fail Memory? (test)', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-failmem', leftValue: expr('{{ $(\'Runtime In\').item.json.test_fail_memory }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const force_Memory_Outage_test = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: 'fe0e581f-1462-4e6f-9e8b-f2bf9ee80589',
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
    id: 'ac6fecad-771a-4aea-8c36-157d583c6801',
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
  config: { id: '14216a39-b989-4ae4-a89a-257651032346', name: 'Dependency Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'd1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'd2', name: 'status', type: 'string', value: 'dependency_failed' }, { id: 'd3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'd4', name: 'dependency', type: 'string', value: 'memory_service' }] } } }
});

const read_Memory = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { id: '0035d0a4-20fb-48c1-b571-04554674b001', name: 'Read Memory', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'YsrehnJIm5d1uxeU', cachedResultName: 'AI_FACTORY — Memory Service' }, workflowInputs: { mappingMode: 'defineBelow', value: { op: 'read', agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), scope: 'agent', key: '', content: '', metadata: '', task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}') }, matchingColumns: [], schema: [{ id: 'op', displayName: 'op', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'scope', displayName: 'scope', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'key', displayName: 'key', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'content', displayName: 'content', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'metadata', displayName: 'metadata', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const memory_Text = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '2161035c-27e3-46b7-8cb3-64a9f1e95b57',
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
  config: { id: '6d9f4c62-492f-4791-ba6b-e41e2bcbd9b9', name: 'Call Tool Gateway', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'MvtXbc0zN7MZYyNC', cachedResultName: 'AI_FACTORY — Tool Gateway' }, workflowInputs: { mappingMode: 'defineBelow', value: { agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), capability_code: 'data_analysis', tool_code: expr('{{ $(\'Runtime In\').item.json.test_fail_tool ? \'tool_send_email\' : \'tool_data_read\' }}'), tool_input: expr('{{ $(\'Sanitize Input\').item.json.sanitized_question }}'), task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}'), test_mode: expr('{{ false }}') }, matchingColumns: [], schema: [{ id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'capability_code', displayName: 'capability_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_code', displayName: 'tool_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_input', displayName: 'tool_input', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'test_mode', displayName: 'test_mode', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const tool_Failure = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '444226ea-dda1-4799-af94-39a155dbd511',
    name: 'Tool Failure',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'retrying', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'tool_failed', jsonb_build_object('tool', 'tool_data_read', 'reason', $3));
INSERT INTO ai_core.recovery_events (incident_type, affected_entity, action_taken, status, data)
VALUES ('tool_failure', 'task:' || $1::text, 'route_to_retry', 'pending', jsonb_build_object('agent', $4, 'reason', $3));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'tool_failed', 'task', $1::text, jsonb_build_object('tool', 'tool_data_read', 'reason', $3, 'status', 'retrying'))
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
  config: { id: 'af99c129-e57c-437f-8a67-647d48d301e6', name: 'Failed Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'f1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'f2', name: 'status', type: 'string', value: 'tool_failed' }, { id: 'f3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'f4', name: 'reason', type: 'string', value: expr('{{ $(\'Call Tool Gateway\').item.json.deny_reason || $(\'Call Tool Gateway\').item.json.error || \'gateway_unavailable\' }}') }] } } }
});

const gateway_OK = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: 'e90b90f0-341f-4d61-8af6-cd7ee5e26c0d', name: 'Gateway OK?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-gw', leftValue: expr('{{ $json.allowed }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const compact_Data = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '23182e77-e12e-4d60-bc39-3ef5a4c06f7b',
    name: 'Compact Data',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const gw = $input.first().json || {};
const data = gw.data || {};
const lines = [];
lines.push('task_status_counts: ' + JSON.stringify(data.task_status_counts || {}));
lines.push('task_results_status: ' + JSON.stringify(data.task_results_status || {}));
lines.push('qc: ' + JSON.stringify(data.qc || {}));
lines.push('agent_metrics_summary: ' + JSON.stringify(data.agent_metrics_summary || []));
lines.push('agent_health: ' + JSON.stringify(data.agent_health || []));
lines.push('recovery_open: ' + JSON.stringify(data.recovery_open));
lines.push('avg_task_duration_sec: ' + JSON.stringify(data.avg_task_duration_sec));
const data_text = lines.join('\\n');
const row_count = (Array.isArray(data.agent_metrics_summary) ? data.agent_metrics_summary.length : 0) + (Array.isArray(data.agent_health) ? data.agent_health.length : 0);
return [{ json: { allowed: gw.allowed === true, tool_code: gw.tool_code || null, audit_id: gw.audit_id || null, data: data, data_text: data_text, row_count: row_count } }];
`
    }
  }
});

const build_Prompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '498e465c-cebb-45db-a43c-b9dc8e4a13f9',
    name: 'Build Prompt',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const ctx = $('Load Ctx').first().json.ctx;
const mem = $('Memory Text').first().json.memory_text;
const data_text = $('Compact Data').first().json.data_text;
const question = $('Sanitize Input').first().json.sanitized_question;
const prompt = 'You are ' + (ctx.prompt || 'a data analytics agent') + '\\n\\n'
  + 'PRIOR AGENT MEMORY (analyst_01):\\n' + mem + '\\n\\n'
  + 'ANALYTICAL QUESTION:\\n' + question + '\\n\\n'
  + 'FACTORY DATA (pre-approved aggregates gathered via the Tool Gateway):\\n' + data_text + '\\n\\n'
  + 'Analyze STRICTLY from the FACTORY DATA above. Do not invent numbers that are not present. '
  + 'Return ONLY a raw JSON object (no prose, no markdown, no code fences) with exactly these keys: '
  + 'findings (array of objects {metric:string, value:string, based_on_rows:number, note:string}), '
  + 'data_gaps (array of strings describing missing or insufficient data), '
  + 'conclusion (string, evidence-based), '
  + 'confidence (number between 0 and 1). '
  + 'Be concise: at most 6 findings, each note <= 200 chars, at most 5 data_gaps. Output valid COMPLETE JSON only. '
  + 'If the data is insufficient, list the gaps and set confidence <= 0.3. Never fabricate metrics or rows. Never include secrets or credentials.';
return [{ json: { prompt: prompt } }];
`
    }
  }
});

const analyze = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { id: 'b29c798b-4ab9-48c1-bced-d4c37a01a365', name: 'Analyze', parameters: { promptType: 'define', text: expr('{{ $(\'Build Prompt\').item.json.prompt }}') }, subnodes: { model: analyst_Model } }
});

const build_Output = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: 'b1074ead-6478-47e7-a7c2-42f5c02539b5',
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
const BT = String.fromCharCode(96);
let raw = ($input.first().json.text) || '';
let t = String(raw).trim();
if (t.indexOf(BT) !== -1) { t = t.split(BT).join(''); if (t.slice(0, 4).toLowerCase() === 'json') { t = t.slice(4); } }
let obj = null;
const s = t.indexOf('{');
const e = t.lastIndexOf('}');
if (s !== -1 && e !== -1 && e > s) { try { obj = JSON.parse(t.slice(s, e + 1)); } catch (err) { obj = null; } }
const compact = $('Compact Data').first().json;
const question = $('Sanitize Input').first().json.sanitized_question;
let confidence = (obj && typeof obj.confidence === 'number') ? Math.max(0, Math.min(1, obj.confidence)) : 0;
const findings = (obj && Array.isArray(obj.findings)) ? obj.findings : [];
const out = {
  question: question,
  findings: findings,
  data_gaps: (obj && Array.isArray(obj.data_gaps)) ? obj.data_gaps : [],
  conclusion: (obj && obj.conclusion) ? obj.conclusion : '',
  confidence: confidence,
  finding_count: findings.length,
  dataset_rows: compact.row_count,
  parsed_ok: !!obj,
  input_redacted: $('Sanitize Input').first().json.input_redacted,
  memory_used: $('Memory Text').first().json.memory_count,
  gateway_audit_id: compact.audit_id,
  generated_at: new Date().toISOString()
};
const outStr = redact(JSON.stringify(out));
return [{ json: { output_json: outStr, confidence: confidence, finding_count: findings.length, parsed_ok: !!obj } }];
`
    }
  }
});

const save_Result = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'cbaf4e41-39fe-477b-966d-732476ad63cc',
    name: 'Save Result',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.task_results (task_id, agent_id, capability_code, output, status, score)
VALUES ($1::bigint, $2::bigint, 'data_analysis', $3::jsonb, NULL, NULL)
RETURNING id;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $(\'Build Output\').item.json.output_json ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const event_Result = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '83b46a00-6870-4e9d-a24b-b3e34d4e1037',
    name: 'Event Result',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'qc', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'result_saved', jsonb_build_object('task_result_id', $3::bigint, 'status', 'awaiting_qc', 'confidence', $5));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'task_result_saved', 'task_result', $3::text, jsonb_build_object('task_id', $1::bigint, 'status', 'awaiting_qc'));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $(\'Save Result\').item.json.id, $(\'Runtime In\').item.json.agent_code, $(\'Build Output\').item.json.confidence ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const runtime_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: 'b83c0ab6-6461-47b7-9f17-c2d61fd61175', name: 'Runtime Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'r1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 'r2', name: 'task_result_id', type: 'number', value: expr('{{ $(\'Save Result\').item.json.id }}') }, { id: 'r3', name: 'status', type: 'string', value: 'awaiting_qc' }, { id: 'r4', name: 'finding_count', type: 'number', value: expr('{{ $(\'Build Output\').item.json.finding_count }}') }, { id: 'r5', name: 'confidence', type: 'number', value: expr('{{ $(\'Build Output\').item.json.confidence }}') }, { id: 'r6', name: 'parsed_ok', type: 'boolean', value: expr('{{ $(\'Build Output\').item.json.parsed_ok }}') }] } } }
});

const audit_Blocked = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'cecc4e2a-e26b-4956-b6cd-5144502016b8',
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
  config: { id: '5c8b87e3-9b20-449b-9525-a983e35f7b62', name: 'Blocked Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'b1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'b2', name: 'reason', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.reason }}') }, { id: 'b3', name: 'task_status', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.task_status }}') }] } } }
});

const audit_Invalid = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '40f25830-b716-4f04-95de-3675aee04da1',
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
  config: { id: 'f4db27ef-6109-4d86-8062-cdfb2fd2a855', name: 'Invalid Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'i1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'i2', name: 'reason', type: 'string', value: expr('{{ $(\'Validate Input\').item.json.validation_error }}') }, { id: 'i3', name: 'status', type: 'string', value: 'rejected' }] } } }
});

const wf = workflow('CPXEE1tOBmIr2Dan', 'AI_FACTORY — Agent Runtime (analyst_01)', { executionOrder: 'v1', errorWorkflow: 'MeClArVW55egSVsM' });

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
        .to(gateway_OK.onTrue(compact_Data
          .to(build_Prompt)
          .to(analyze)
          .to(build_Output)
          .to(save_Result)
          .to(event_Result)
          .to(runtime_Out)).onFalse(tool_Failure))))).onFalse(audit_Blocked
      .to(blocked_Out)))).onFalse(audit_Invalid
    .to(invalid_Out)))
  .group('Validate input', [validate_Input, input_Valid], { description: 'Детерминированно проверяет task_id и agent_code до загрузки контекста и LLM' })
  .group('Reject input', [audit_Invalid, invalid_Out], { description: 'Невалидный/malformed вход: пишет причину в audit_logs и возвращает отказ вызывающему' })
  .group('Load & authorize', [load_Ctx, runnable], { description: 'Загружает аналитическую задачу, агента, версию и lease; проверяет capability data_analysis' })
  .group('Run analysis', [start_Task, sanitize_Input, fail_Memory_test, force_Memory_Outage_test, read_Memory, memory_Failure, dependency_Out, memory_Text, call_Tool_Gateway, gateway_OK, compact_Data, build_Prompt, analyze, analyst_Model, build_Output, save_Result, event_Result, runtime_Out, tool_Failure, failed_Out], { description: 'Читает внутренние агрегаты через Tool Gateway→tool_data_read, анализирует LLM и сохраняет результат; при ошибке шлюза или памяти уходит в retry' })
  .group('Blocked', [audit_Blocked, blocked_Out], { description: 'Задача не выполняется: причина в audit_logs и в ответе' })