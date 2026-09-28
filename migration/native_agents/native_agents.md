# AI_FACTORY — Native n8n Agent Artifacts

n8n Agents-module artifacts (separate from the workflow control-plane). 3 found, all unpublished.

| agentId | name | published | relationship | status |
|---------|------|-----------|--------------|--------|
| AIcquvugahGNnBiT | AI_FACTORY — Master Core | false | delegate_to_chief -> Chief (SwKlbhPUu6VrUsXp) only | UNKNOWN purpose beyond delegation; unpublished |
| zBKHj4yFRCayDzu6 | Content Automation Agent | false | delegate_to_chief only | UNKNOWN scope; unpublished |
| vm2pAOlGqPBgtprP | New Agent | false | ROLE_STATUS=UNDEFINED / PRODUCTION_EXECUTION=DISABLED (HELD) | UNKNOWN placeholder, held |

Notes:
- All three unpublished, sit OUTSIDE the ai_core workflow control-plane; reference the Chief workflow as delegation target.
- Full internal config (instructions/model/tools) is owned by the Agents module and is NOT exportable via the workflow get-as-code path. Metadata preserved; config marked UNKNOWN (not invented).
