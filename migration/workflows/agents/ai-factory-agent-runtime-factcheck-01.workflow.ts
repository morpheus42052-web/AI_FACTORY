import { workflow, trigger, node, newCredential, languageModel, expr } from '@n8n/workflow-sdk';

const fact_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6, config: { id: '03993fee-f2be-4978-bcb5-8550236473ec', name: 'Fact Model', parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-4-6', cachedResultName: 'Claude Sonnet 4.6' }, options: { maxTokensToSample: 1200 } }, credentials: { anthropicApi: newCredential('Gateway credits') } } });

const runtime_In = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { id: 'a763a586-6a2e-4888-8133-4d5ae25c5bd2', name: 'Runtime In', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'task_id', type: 'number' }, { name: 'agent_code', type: 'string' }, { name: 'test_fail_memory', type: 'boolean' }, { name: 'test_fail_tool', type: 'boolean' }] } } }
});

const validate_Input = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '539d816d-c824-4c2e-b0d4-b3a1399ebf91',
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
  config: { id: '1b56925a-970e-4812-bdaf-1e7c6fd9c6a5', name: 'Input Valid?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c-valid', leftValue: expr('{{ $json.valid }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const load_Ctx = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '461d062a-abe9-44cc-9179-dfd6a191d747',
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
  'capability_ok', COALESCE((SELECT 'fact_checking' = ANY(required_capabilities) FROM t), false),
  'objective_present', COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false),
  'runnable', (
     (SELECT count(*) FROM t) > 0
     AND COALESCE((SELECT status FROM a) = 'active', false)
     AND NOT COALESCE((SELECT emergency_stopped FROM a), false)
     AND COALESCE((SELECT 'fact_checking' = ANY(required_capabilities) FROM t), false)
     AND COALESCE(length(btrim(COALESCE((SELECT objective FROM t), ''))) > 0, false)
     AND (SELECT count(*) FROM l) > 0
     AND COALESCE((SELECT status FROM t) NOT IN ('completed','cancelled'), false)
  ),
  'reason', CASE
     WHEN (SELECT count(*) FROM t) = 0 THEN 'task_not_found'
     WHEN NOT COALESCE((SELECT status FROM a) = 'active', false) THEN 'agent_inactive'
     WHEN COALESCE((SELECT emergency_stopped FROM a), false) THEN 'agent_emergency_stop'
     WHEN NOT COALESCE((SELECT 'fact_checking' = ANY(required_capabilities) FROM t), false) THEN 'capability_mismatch'
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
  config: { id: '1ffa90a0-bb7b-43a1-9415-1a5abe04387c', name: 'Runnable?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c', leftValue: expr('{{ $json.ctx.runnable }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const start_Task = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '3643b423-fc12-4ec5-a542-ac917e2a4643',
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
    id: 'c9aef616-c46d-4501-8f88-363cb90354fb',
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
return [{ json: { sanitized_claim: out, input_redacted: out !== raw } }];
`
    }
  }
});

const fail_Memory_test = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '3692ac11-86a0-4dca-9e23-b09401586363', name: 'Fail Memory? (test)', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-failmem', leftValue: expr('{{ $(\'Runtime In\').item.json.test_fail_memory }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const force_Memory_Outage_test = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '3b9fde37-7ad1-4ff5-a1e3-4170aeafc02e',
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
    id: '587ff40f-8b09-46fc-8f34-0cd44e4875b6',
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
  config: { id: '6183bb88-f94a-4a7e-96d1-8f036b7a7a4b', name: 'Dependency Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'd1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'd2', name: 'status', type: 'string', value: 'dependency_failed' }, { id: 'd3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'd4', name: 'dependency', type: 'string', value: 'memory_service' }] } } }
});

const read_Memory = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { id: '70f26a30-6046-4e76-93c6-35cdb2083d2f', name: 'Read Memory', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'YsrehnJIm5d1uxeU', cachedResultName: 'AI_FACTORY — Memory Service' }, workflowInputs: { mappingMode: 'defineBelow', value: { op: 'read', agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), scope: 'agent', key: '', content: '', metadata: '', task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}') }, matchingColumns: [], schema: [{ id: 'op', displayName: 'op', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'scope', displayName: 'scope', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'key', displayName: 'key', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'content', displayName: 'content', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'metadata', displayName: 'metadata', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const memory_Text = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '2ff47ad6-1d8f-468a-8795-b99b9a5e7c6b',
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
  config: { id: '0a43e2d3-f33d-4ace-9780-89d4774d27b1', name: 'Call Tool Gateway', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'MvtXbc0zN7MZYyNC', cachedResultName: 'AI_FACTORY — Tool Gateway' }, workflowInputs: { mappingMode: 'defineBelow', value: { agent_code: expr('{{ $(\'Runtime In\').item.json.agent_code }}'), capability_code: 'fact_checking', tool_code: expr('{{ $(\'Runtime In\').item.json.test_fail_tool ? \'tool_send_email\' : \'tool_web_search\' }}'), tool_input: expr('{{ $(\'Sanitize Input\').item.json.sanitized_claim }}'), task_id: expr('{{ $(\'Runtime In\').item.json.task_id + \'\' }}'), test_mode: expr('{{ false }}') }, matchingColumns: [], schema: [{ id: 'agent_code', displayName: 'agent_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'capability_code', displayName: 'capability_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_code', displayName: 'tool_code', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'tool_input', displayName: 'tool_input', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'task_id', displayName: 'task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'test_mode', displayName: 'test_mode', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } }, onError: 'continueErrorOutput' }
});

const tool_Failure = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '3d883ec8-0843-4201-94d7-4d2d1fe7da09',
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
  config: { id: 'ade37af3-c647-41a4-a1ea-1196faa9e318', name: 'Failed Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'f1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'f2', name: 'status', type: 'string', value: 'tool_failed' }, { id: 'f3', name: 'task_status', type: 'string', value: 'retrying' }, { id: 'f4', name: 'reason', type: 'string', value: expr('{{ $(\'Call Tool Gateway\').item.json.deny_reason || $(\'Call Tool Gateway\').item.json.error || \'gateway_unavailable\' }}') }] } } }
});

const gateway_OK = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '10c69704-06f5-4dd7-b0ec-ae65b930d07e', name: 'Gateway OK?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c-gw', leftValue: expr('{{ $json.allowed }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const compact_Sources = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '2bd69a9c-72fa-4a76-b36e-7e207cfdf331',
    name: 'Compact Sources',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const gw = $input.first().json || {};
const brave = Array.isArray(gw.results) ? gw.results[0] : gw.results;
let web = [];
if (brave && brave.web && Array.isArray(brave.web.results)) web = brave.web.results;
if (web.length === 0 && brave && brave.discussions && Array.isArray(brave.discussions.results)) web = brave.discussions.results;
const strip = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/\\s+/g, ' ').trim().slice(0, 300);
const sources = web.slice(0, 6).map((r) => ({ title: r.title || '', url: r.url || '', description: strip(r.description), age: r.age || r.page_age || null }));
const sources_text = sources.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' (' + (s.age || 'date n/a') + ')\\n' + s.url + '\\n' + s.description).join('\\n\\n');
return [{ json: { allowed: gw.allowed === true, tool_code: gw.tool_code || null, audit_id: gw.audit_id || null, source_count: sources.length, sources, sources_text } }];
`
    }
  }
});

const build_Prompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '7bd80422-5b29-415b-9c91-2acad34e4947',
    name: 'Build Prompt',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const ctx = $('Load Ctx').first().json.ctx;
const mem = $('Memory Text').first().json.memory_text;
const sources = $('Compact Sources').first().json.sources_text;
const claim = $('Sanitize Input').first().json.sanitized_claim;
const prompt = 'You are ' + (ctx.prompt || 'a fact-checking agent') + '\\n\\n'
  + 'PRIOR AGENT MEMORY (factcheck_01):\\n' + mem + '\\n\\n'
  + 'CLAIM TO VERIFY:\\n' + claim + '\\n\\n'
  + 'EVIDENCE (web sources gathered via the Tool Gateway):\\n' + sources + '\\n\\n'
  + 'Verify the CLAIM strictly against the EVIDENCE above. Do not rely on outside knowledge as proof. '
  + 'Return ONLY a raw JSON object (no prose, no markdown, no code fences) with exactly these keys: '
  + 'verdict (one of: supported, refuted, partially_supported, unverified), '
  + 'confidence (number between 0 and 1), '
  + 'claim_restated (string), '
  + 'assessments (array of objects {source_index:number, url:string, supports: one of yes|no|partial, note:string}), '
  + 'contradictions (array of strings describing conflicts between sources), '
  + 'evidence_recency (string describing how current/dated the evidence is), '
  + 'citations (array of source URLs actually used to reach the verdict). '
  + 'If the evidence is insufficient to decide, set verdict to unverified and confidence <= 0.3. '
  + 'Never fabricate sources, URLs, or citations. Never include secrets or credentials.';
return [{ json: { prompt: prompt } }];
`
    }
  }
});

const verify_Claim = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { id: 'db8bf493-cb3b-472b-aa23-8cede3880d25', name: 'Verify Claim', parameters: { promptType: 'define', text: expr('{{ $(\'Build Prompt\').item.json.prompt }}') }, subnodes: { model: fact_Model } }
});

const build_Output = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    id: '4b912abb-47e8-47cf-aea6-fe45dc483841',
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
const compact = $('Compact Sources').first().json;
const claim = $('Sanitize Input').first().json.sanitized_claim;
const allowedVerdicts = ['supported', 'refuted', 'partially_supported', 'unverified'];
let verdict = (obj && allowedVerdicts.indexOf(obj.verdict) !== -1) ? obj.verdict : 'unverified';
let confidence = (obj && typeof obj.confidence === 'number') ? Math.max(0, Math.min(1, obj.confidence)) : 0;
const out = {
  claim: claim,
  verdict: verdict,
  confidence: confidence,
  claim_restated: (obj && obj.claim_restated) ? obj.claim_restated : claim,
  assessments: (obj && Array.isArray(obj.assessments)) ? obj.assessments : [],
  contradictions: (obj && Array.isArray(obj.contradictions)) ? obj.contradictions : [],
  evidence_recency: (obj && obj.evidence_recency) ? obj.evidence_recency : null,
  citations: (obj && Array.isArray(obj.citations)) ? obj.citations : compact.sources.map(function (x) { return x.url; }),
  sources: compact.sources,
  source_count: compact.source_count,
  parsed_ok: !!obj,
  input_redacted: $('Sanitize Input').first().json.input_redacted,
  memory_used: $('Memory Text').first().json.memory_count,
  gateway_audit_id: compact.audit_id,
  generated_at: new Date().toISOString()
};
const outStr = redact(JSON.stringify(out));
return [{ json: { output_json: outStr, verdict: verdict, confidence: confidence, source_count: compact.source_count, parsed_ok: !!obj } }];
`
    }
  }
});

const save_Result = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '7e291ffc-1a53-49dd-81af-97a2f72c74dd',
    name: 'Save Result',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.task_results (task_id, agent_id, capability_code, output, status, score)
VALUES ($1::bigint, $2::bigint, 'fact_checking', $3::jsonb, NULL, NULL)
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
    id: 'ba328c04-9613-4c69-a82d-2b32a0ea874c',
    name: 'Event Result',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'qc', updated_at = now() WHERE id = $1::bigint;
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, $2::bigint, 'result_saved', jsonb_build_object('task_result_id', $3::bigint, 'status', 'awaiting_qc', 'verdict', $5));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($4, 'task_result_saved', 'task_result', $3::text, jsonb_build_object('task_id', $1::bigint, 'verdict', $5, 'status', 'awaiting_qc'));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Runtime In\').item.json.task_id, $(\'Load Ctx\').item.json.ctx.agent_id, $(\'Save Result\').item.json.id, $(\'Runtime In\').item.json.agent_code, $(\'Build Output\').item.json.verdict ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const runtime_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: '67eea860-7537-4748-bf7e-91b5ebf2d645', name: 'Runtime Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'r1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 'r2', name: 'task_result_id', type: 'number', value: expr('{{ $(\'Save Result\').item.json.id }}') }, { id: 'r3', name: 'status', type: 'string', value: 'awaiting_qc' }, { id: 'r4', name: 'verdict', type: 'string', value: expr('{{ $(\'Build Output\').item.json.verdict }}') }, { id: 'r5', name: 'confidence', type: 'number', value: expr('{{ $(\'Build Output\').item.json.confidence }}') }, { id: 'r6', name: 'source_count', type: 'number', value: expr('{{ $(\'Build Output\').item.json.source_count }}') }, { id: 'r7', name: 'parsed_ok', type: 'boolean', value: expr('{{ $(\'Build Output\').item.json.parsed_ok }}') }] } } }
});

const audit_Blocked = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'c02fd799-bdf6-4280-9d00-97b43a965642',
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
  config: { id: '071b830c-4d0f-4a60-8c68-23c962b997f3', name: 'Blocked Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'b1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'b2', name: 'reason', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.reason }}') }, { id: 'b3', name: 'task_status', type: 'string', value: expr('{{ $(\'Load Ctx\').item.json.ctx.task_status }}') }] } } }
});

const audit_Invalid = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: '43a0a6cd-cc75-49d3-bc08-61195c2beec1',
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
  config: { id: '24a1cb8a-5204-4ac7-a39e-27f2160e2b5a', name: 'Invalid Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'i1', name: 'ok', type: 'boolean', value: expr('{{ false }}') }, { id: 'i2', name: 'reason', type: 'string', value: expr('{{ $(\'Validate Input\').item.json.validation_error }}') }, { id: 'i3', name: 'status', type: 'string', value: 'rejected' }] } } }
});

const wf = workflow('90MPYIUVyoR9PrHf', 'AI_FACTORY — Agent Runtime (factcheck_01)', { executionOrder: 'v1', errorWorkflow: 'MeClArVW55egSVsM' });

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
          .to(verify_Claim)
          .to(build_Output)
          .to(save_Result)
          .to(event_Result)
          .to(runtime_Out)).onFalse(tool_Failure))))).onFalse(audit_Blocked
      .to(blocked_Out)))).onFalse(audit_Invalid
    .to(invalid_Out)))
  .group('Validate input', [validate_Input, input_Valid], { description: 'Детерминированно проверяет task_id и agent_code до загрузки контекста и LLM' })
  .group('Reject input', [audit_Invalid, invalid_Out], { description: 'Невалидный/malformed вход: пишет причину в audit_logs и возвращает отказ вызывающему' })
  .group('Load & authorize', [load_Ctx, runnable], { description: 'Загружает задачу-утверждение, агента, активную версию и lease; проверяет capability fact_checking' })
  .group('Verify claim', [start_Task, sanitize_Input, fail_Memory_test, force_Memory_Outage_test, read_Memory, memory_Failure, dependency_Out, memory_Text, call_Tool_Gateway, gateway_OK, compact_Sources, build_Prompt, verify_Claim, fact_Model, build_Output, save_Result, event_Result, runtime_Out, tool_Failure, failed_Out], { description: 'Собирает доказательства через Tool Gateway→Brave, проверяет утверждение LLM и сохраняет вердикт; при отказе/ошибке шлюза или памяти уходит в retr' })
  .group('Blocked', [audit_Blocked, blocked_Out], { description: 'Задача не выполняется: причина блокировки в audit_logs и в ответе' })