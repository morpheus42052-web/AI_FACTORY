# Deployment order
1. PostgreSQL
2. pgvector
3. database/DATABASE.sql
4. n8n credentials
5. 00_CORE_INTAKE
6. 01_GOVERNOR through 26_FINAL_ORCHESTRATOR
7. tests

Critical production changes must pass an approval gate. Agents never receive unrestricted credentials.
