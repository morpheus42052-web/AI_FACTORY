# AI_FACTORY — Control Plane & Services Map

Full source .ts under migration/workflows/{control_plane,services,qc,retry}/.

## Control plane (8 canonical)
| Component | n8n ID | Role |
|-----------|--------|------|
| Chief | SwKlbhPUu6VrUsXp | sole user-facing authority; validate objective, delegate |
| Core Intake | HXNxlc80adrEQLVm | sole task-creation authority (actor=core_intake) |
| Governor (canonical) | Xwt2lhpjVSGy8phT | deterministic policy gate |
| Final Orchestrator | kJ6RsszT8BYjT6RM | campaign/multi-task DAG driver |
| Dependency Engine | tje7BrRpdmKh76Sp | DAG validate + promote (disclaims lease authority) |
| Agent Selector | QHRW2lPT7Uyc8p0N | capability->agent selection |
| Resolver / Dispatch Adapter | vkc7rgDbOMniAYAz | agent_code->runtime dispatch; lease/idempotency guarded |
| Orchestrator Runtime (orchestrator_01) | e2ipVQKCD2DSDTw2 | single-task planner/coordinator |

Lease authority: `ai_core.reserve_agent` = sole queued->assigned path. Child runtime does assigned->running.

## Agent runtimes (6 + orchestrator)
research_01 TVV1eh8EwohRL2BD, factcheck_01 90MPYIUVyoR9PrHf, analyst_01 CPXEE1tOBmIr2Dan, writer_01 GI59nAFYGkKqGZF3, editor_01 CKMjyonzBVYWnnFn, seo_01 8A45fx270mqqyfxk (orchestrator_01 e2ipVQKCD2DSDTw2 under control_plane).

## Services
Tool Gateway MvtXbc0zN7MZYyNC (security boundary), Memory YsrehnJIm5d1uxeU, Knowledge Ingest ZrUI19EQScXUmxgy, Knowledge Search wLNuWbyz0xQQzzlg, Performance 6Gx5Wki0ZiY7a1jO, Monitoring 7HsnUiaWGuXLr5cS, Self Diagnostics tKfTEvVU7wauq7yB, Scheduler Xia8aa84JWQMjyo0, Learning 0Zy017DSSXxPZN0m, Self Improvement DTBsWbE663IOGLWl, Simulator xtQgIfB2VzfbWSF1, Experiment kV4NrmEsiWuHR3dg, Error Handler MeClArVW55egSVsM.

## QC
Orchestrator QC hYKrC4iwhP49iJOu; per-agent QC: research 7A9lmoXHziagm43z, factcheck 2zxB4SYiUBT5qwMo, analyst 4HOdz0KyIt0N0YnQ, Writer B8a9IfgMP8YV7l38, Editor hFolEHVlYVN3xJRi, SEO yIwHe4Q0zqw0DRyO.

## Retry/Recovery
research Ik3TJw9YOoHhOarj, factcheck JvK06TW9v1HUO4UU, analyst bMwg4B1zOzLpJNv8, writer DSv02v28o4gTd1Oo, editor gQXScoJtPqe5rpGM, seo AFzXLoFI9pc2wR1i, orchestrator wH1Gd144we5zPSml.

## Dependency chain
USER -> Chief -> Core Intake -> Final Orchestrator -> Governor -> Dependency Engine -> Agent Selector -> Resolver/Dispatch -> Orchestrator_01 -> Agent Runtimes -> Tool Gateway -> LLM(OmniRoute)/Brave -> task_results -> QC -> Retry -> Memory -> Performance/Monitoring -> Audit -> Chief -> USER.

## CEO
NOT present in n8n (MIG-B03). Required by target architecture but has NO source. Never invented.

## Known defect carried in source
GAP-INTAKE-001: published Core Intake (e5415255) + Chief (03b6caf6) carried a comma-parameter defect; drafts (2ada0e6a / 840530a3) contain the array-form fix. Exported source reflects current draft (fixed). Local runtime MUST use real positional params ($1..$4).
