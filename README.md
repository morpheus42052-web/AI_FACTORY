# AI_FACTORY PACKAGE v0.1.0

Foundation package for the previously designed n8n + PostgreSQL + pgvector AI Factory.

Includes:
- PostgreSQL/pgvector schema
- agent and manager registry
- 27 named workflow files
- working starter CORE_INTAKE workflow
- configuration template
- tests and documentation scaffold

Important: provider credentials and secrets are NOT included. Configure them in n8n Credentials.
The remaining workflow files are intentionally safe scaffolds until provider-specific nodes are selected;
do not activate them as production automation before configuration and testing.
