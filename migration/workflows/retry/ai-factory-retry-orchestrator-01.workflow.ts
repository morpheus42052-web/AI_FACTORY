import { workflow, trigger, node, newCredential, expr } from '@n8n/workflow-sdk';

const retry_In = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { id: '1d24313e-c8f9-475b-aaa6-083d06c56215', name: 'Retry In', parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'task_id', type: 'number' }, { name: 'agent_code', type: 'string' }] } } }
});

const load_Retry_Ctx = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'e2f85afc-7ad9-4d32-82bd-68754a110836',
    name: 'Load Retry Ctx',
    parameters: {
      operation: 'executeQuery',
      query: `
WITH t AS (SELECT * FROM ai_core.tasks WHERE id = $1::bigint),
     att AS (SELECT count(*) AS c FROM ai_core.qc_results WHERE task_id = $1::bigint),
     l AS (SELECT id FROM ai_core.agent_leases WHERE task_id = $1::bigint AND status = 'active' ORDER BY acquired_at DESC LIMIT 1),
     lastreason AS (
       SELECT after->>'reason' AS r FROM ai_core.audit_logs
       WHERE entity_type = 'task' AND entity_id = $1::text AND action IN ('runtime_blocked','qc_rejected')
       ORDER BY id DESC LIMIT 1
     )
SELECT json_build_object(
  'task_exists', (SELECT count(*) FROM t) > 0,
  'task_status', (SELECT status FROM t),
  'requested_capability', COALESCE((SELECT required_capabilities[1] FROM t), 'agent_orchestration'),
  'attempts', (SELECT c FROM att),
  'max_attempts', COALESCE((SELECT (payload->>'max_attempts')::int FROM t), 3),
  'has_active_lease', (SELECT count(*) FROM l) > 0,
  'is_retrying', COALESCE((SELECT status FROM t) = 'retrying', false),
  'last_reason', (SELECT r FROM lastreason),
  'non_retryable', COALESCE((SELECT r FROM lastreason) IN ('context_over_budget','security_violation','policy_violation','configuration_error'), false),
  'exhausted', (
     (SELECT c FROM att) >= COALESCE((SELECT (payload->>'max_attempts')::int FROM t), 3)
     OR COALESCE((SELECT r FROM lastreason) IN ('context_over_budget','security_violation','policy_violation','configuration_error'), false)
  )
) AS rc;
`,
      options: { queryBatching: 'single', queryReplacement: expr('{{ $json.task_id }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const retrying = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: 'a37b9faa-ac5d-4f4c-a529-645e941a6d10', name: 'Retrying?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c', leftValue: expr('{{ $json.rc.is_retrying }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const exhausted = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { id: '74bc05e3-c9a4-4790-9cf3-e06d5c3416c2', name: 'Exhausted?', parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: 'c', leftValue: expr('{{ $json.rc.exhausted }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const escalate = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'a61c631f-9a2b-4781-8f50-cbfcbc00d533',
    name: 'Escalate',
    parameters: {
      operation: 'executeQuery',
      query: `
UPDATE ai_core.tasks SET status = 'escalated', updated_at = now() WHERE id = $1::bigint;
UPDATE ai_core.agent_leases SET status = 'released', released_at = now() WHERE task_id = $1::bigint AND status = 'active';
INSERT INTO ai_core.recovery_events (incident_type, affected_entity, action_taken, status, data)
VALUES ('retry_exhausted', 'task:' || $1::text, 'escalate_to_manager', 'pending',
        jsonb_build_object('attempts', $3::int, 'max_attempts', $4::int, 'agent', $2, 'last_reason', $5));
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, (SELECT id FROM ai_core.agents WHERE agent_code = $2), 'retry_exhausted',
        jsonb_build_object('attempts', $3::int, 'max_attempts', $4::int, 'last_reason', $5));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($2, 'retry_exhausted', 'task', $1::text, jsonb_build_object('status', 'escalated', 'attempts', $3::int, 'last_reason', $5));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Retry In\').item.json.task_id, $(\'Retry In\').item.json.agent_code, $(\'Load Retry Ctx\').item.json.rc.attempts, $(\'Load Retry Ctx\').item.json.rc.max_attempts, $(\'Load Retry Ctx\').item.json.rc.last_reason ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const escalated_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: '550e2da1-6fe4-41be-b440-3913b12b0006', name: 'Escalated Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'e1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 'e2', name: 'action', type: 'string', value: 'escalated' }, { id: 'e3', name: 'task_status', type: 'string', value: 'escalated' }, { id: 'e4', name: 'attempts', type: 'number', value: expr('{{ $(\'Load Retry Ctx\').item.json.rc.attempts }}') }, { id: 'e5', name: 'last_reason', type: 'string', value: expr('{{ $(\'Load Retry Ctx\').item.json.rc.last_reason }}') }] } } }
});

const log_Retry = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    id: 'ed71a0fd-abd4-4d97-b72e-315f24fba16c',
    name: 'Log Retry',
    parameters: {
      operation: 'executeQuery',
      query: `
INSERT INTO ai_core.task_events (task_id, agent_id, event_type, data)
VALUES ($1::bigint, (SELECT id FROM ai_core.agents WHERE agent_code = $2), 'retry', jsonb_build_object('attempt', $3::int + 1));
INSERT INTO ai_core.audit_logs (actor, action, entity_type, entity_id, after)
VALUES ($2, 'retry', 'task', $1::text, jsonb_build_object('attempt', $3::int + 1));
`,
      options: { queryBatching: 'transaction', queryReplacement: expr('{{ [ $(\'Retry In\').item.json.task_id, $(\'Retry In\').item.json.agent_code, $(\'Load Retry Ctx\').item.json.rc.attempts ] }}') }
    },
    credentials: { postgres: newCredential('AI_FACTORY Postgres', '7j4vPc4PQWPU29kM') }
  }
});

const backoff_Delay = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { id: 'd4257294-7d0b-4423-9b96-0076e76b1494', name: 'Backoff Delay', parameters: { resume: 'timeInterval', unit: 'seconds', amount: expr('{{ ([\'provider_error\',\'timeout\',\'rate_limit\'].indexOf($(\'Load Retry Ctx\').item.json.rc.last_reason) > -1) ? Math.min(5, Math.pow(2, Math.max(0, ($(\'Load Retry Ctx\').item.json.rc.attempts || 1) - 1))) : 0 }}') }, webhookId: 'c1c8a521-d6f1-48a1-9655-d9f82f47dbda' }
});

const run_Orchestrator_Runtime = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { id: 'bacaa265-3992-4dd0-a2fe-59a2dc75b659', name: 'Run Orchestrator Runtime', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'e2ipVQKCD2DSDTw2', cachedResultName: 'AI_FACTORY — Agent Runtime (orchestrator_01)' }, workflowInputs: { mappingMode: 'defineBelow', value: { orchestration_task_id: expr('{{ $(\'Retry In\').item.json.task_id }}'), requested_by: 'retry:orchestrator_01', requested_capability: expr('{{ $(\'Load Retry Ctx\').item.json.rc.requested_capability }}'), requested_mode: 'normal' }, matchingColumns: [], schema: [{ id: 'orchestration_task_id', displayName: 'orchestration_task_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' }, { id: 'requested_by', displayName: 'requested_by', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'requested_capability', displayName: 'requested_capability', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }, { id: 'requested_mode', displayName: 'requested_mode', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } } }
});

const retry_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: '28cb2799-55f9-4541-87b4-50f6a6d16225', name: 'Retry Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'o1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 'o2', name: 'action', type: 'string', value: 'retry' }, { id: 'o3', name: 'attempt', type: 'number', value: expr('{{ $(\'Load Retry Ctx\').item.json.rc.attempts + 1 }}') }, { id: 'o4', name: 'runtime_ok', type: 'boolean', value: expr('{{ $(\'Run Orchestrator Runtime\').item.json.ok }}') }, { id: 'o5', name: 'runtime_stage', type: 'string', value: expr('{{ $(\'Run Orchestrator Runtime\').item.json.stage }}') }, { id: 'o6', name: 'qc_decision', type: 'string', value: expr('{{ ($(\'Run Orchestrator Runtime\').item.json.qc || {}).decision }}') }, { id: 'o7', name: 'runtime_status', type: 'string', value: expr('{{ $(\'Run Orchestrator Runtime\').item.json.status }}') }] } } }
});

const skip_Out = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { id: 'ad24429e-cce1-4b1c-b6d5-e861e71cd518', name: 'Skip Out', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 's1', name: 'ok', type: 'boolean', value: expr('{{ true }}') }, { id: 's2', name: 'skipped', type: 'boolean', value: expr('{{ true }}') }, { id: 's3', name: 'reason', type: 'string', value: expr('{{ $(\'Load Retry Ctx\').item.json.rc.task_exists ? (\'not_retrying:\' + $(\'Load Retry Ctx\').item.json.rc.task_status) : \'task_not_found\' }}') }] } } }
});

const wf = workflow('wH1Gd144we5zPSml', 'AI_FACTORY — Agent Retry/Recovery (orchestrator_01)', { executionOrder: 'v1', errorWorkflow: 'MeClArVW55egSVsM' });

export default wf
  .add(retry_In)
  .to(load_Retry_Ctx)
  .to(retrying.onTrue(exhausted.onTrue(escalate
      .to(escalated_Out)).onFalse(log_Retry
      .to(backoff_Delay)
      .to(run_Orchestrator_Runtime)
      .to(retry_Out))).onFalse(skip_Out))
  .group('Escalate to manager', [escalate, escalated_Out], { description: 'When attempts are exhausted or the failure is non-retryable, marks the task escalated, releases the lease, and records a recovery event for the m' })
  .group('Re-run orchestration', [log_Retry, backoff_Delay, run_Orchestrator_Runtime, retry_Out], { description: 'Logs the retry, waits a backoff for transient failures, then re-invokes the orchestrator Runtime which self-persists and self-QCs the new attempt' })