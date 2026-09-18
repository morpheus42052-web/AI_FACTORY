# Tests
Integration: simple task, parallel subtasks, dependencies, QC rejection, retry exhaustion.
Failure: LLM timeout, invalid JSON, DB timeout, tool timeout, provider 429, expired lease, unavailable agent.
Load: 10/50/100/500 tasks.
Security: unauthorized tool, denied capability, prompt injection, secret leakage, version promotion,
emergency-stop bypass, direct production DB mutation.
