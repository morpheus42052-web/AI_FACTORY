# AI_FACTORY — MASTER CORE GAP BACKLOG

> Единый источник истины для всех GAP, найденных при аудите эталонных промптов:
> `PROMPT_1_MASTER_CORE`, `PROMPT_2_FOUNDATION`, `PROMPT_3_TASK_ENGINE`, `PROMPT_4_AI_HIERARCHY`.
>
> Этот файл ведётся в GitHub и **отделён** от аудируемой системы: `ai_core`,
> PostgreSQL production schema, production workflows и production task data при
> создании/ведении backlog не изменяются.

## Протокол

1. Каждый найденный GAP заносится в backlog.
2. GAP не удаляется при переходе к следующему Prompt.
3. GAP не считается закрытым без фактического `FIX → TEST → RETEST → VALIDATE`.
4. Пока GAP не исправляется — статус `OPEN`.
5. Исправление начато — `IN_PROGRESS`.
6. Успешно исправлен и протестирован — `VALIDATED`.
7. Невозможно / требует решения пользователя — `BLOCKED`.
8. Ошибочно определён — `REJECTED` (обязательно с причиной).

**Статусы:** `OPEN` · `IN_PROGRESS` · `VALIDATED` · `BLOCKED` · `REJECTED`
**Приоритет:** `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`
**Правило закрытия:** `OPEN → IN_PROGRESS → VALIDATED`

После аудитов Prompt №1–4 исправления **не** начинаются автоматически — только после
отдельного подтверждения пользователя, по циклу `PRIORITIZE → FIX → TEST → RETEST → VALIDATE → CLOSE GAP`.

---

## GAP-записи

### GAP-P1-001

```text
GAP-ID:              GAP-P1-001
Source Prompt:       PROMPT_1_MASTER_CORE
Requirement:         MASTER CORE требует интеграцию AI_FACTORY с GitHub-репозиторием
                     https://github.com/morpheus42052-web/AI_FACTORY.
Current State:       В n8n-проекте нет GitHub-учётки и GitHub-нод в составе системы.
                     Единственный credential проекта — «AI_FACTORY Postgres» (postgres).
                     (Примечание: GitHub MCP-подключение существует только как инструмент
                     ведения этого backlog и НЕ является интеграцией самой системы AI_FACTORY.)
Evidence:            credentials(list) = только AI_FACTORY Postgres; mcp-servers(connected)
                     на момент аудита пуст; AUDIT Prompt №1 (read-only).
Status:              OPEN
Severity:            MEDIUM
Priority:            MEDIUM
Required Change:     Решение пользователя по GitHub-интеграции системы; при необходимости —
                     GitHub credential + workflow синхронизации артефактов.
Dependencies:        GitHub credential (создаёт пользователь); решение о scope интеграции.
Test Plan:           Проверить чтение/запись/commit в репозиторий из n8n-системы.
Execution IDs:       —
Affected Workflows:  —
Affected Tables:     —
Production Impact:    нет (функция отсутствует).
Created At:           2026-09-21
Updated At:           2026-09-21
```

### GAP-P1-002

```text
GAP-ID:              GAP-P1-002
Source Prompt:       PROMPT_1_MASTER_CORE
Requirement:         Agent Selector как компонент MASTER CORE должен подтверждаться
                     фактическим прогоном.
Current State:       В рамках AUDIT Prompt №1 повторно НЕ прогонялся (ранее многократно
                     тестировался на PostgreSQL: exec #33/#50/#52 и др., но не в этом аудите).
Evidence:            AUDIT Prompt №1 — помечен как NOT TESTED.
Status:              OPEN
Severity:            LOW
Priority:            LOW
Required Change:     Контрольный live-прогон Agent Selector в рамках соответствующего аудита.
Dependencies:        —
Test Plan:           Live-прогон workflow QHRW2lPT7Uyc8p0N с эталонным входом, сверка результата.
Execution IDs:       —
Affected Workflows:  QHRW2lPT7Uyc8p0N (AI_FACTORY — Agent Selector)
Affected Tables:     ai_core.agents, ai_core.capabilities, ai_core.agent_capabilities
Production Impact:    нет.
Created At:           2026-09-21
Updated At:           2026-09-21
```

### GAP-P1-003

```text
GAP-ID:              GAP-P1-003
Source Prompt:       PROMPT_1_MASTER_CORE
Requirement:         MASTER CORE предполагает механизм system_state (чтение/запись состояния системы).
Current State:       Чтение/запись system_state фактически не проверены; наличие и использование
                     механизма не подтверждены доказательствами.
Evidence:            AUDIT Prompt №1 — помечен как NOT TESTED.
Status:              OPEN
Severity:            MEDIUM
Priority:            MEDIUM
Required Change:     Определить, какая таблица/механизм реализует system_state; проверить чтение/запись.
Dependencies:        Уточнение маппинга требования на фактическую схему.
Test Plan:           SELECT/UPSERT против таблицы состояния, сверка с эталоном.
Execution IDs:       —
Affected Workflows:  —
Affected Tables:     (уточняется — предположительно system_config / system_snapshots)
Production Impact:    нет подтверждённого.
Created At:           2026-09-21
Updated At:           2026-09-21
```

---

## GAP BACKLOG SUMMARY

- Total GAP: 3
- OPEN: 3
- IN_PROGRESS: 0
- VALIDATED: 0
- BLOCKED: 0
- REJECTED: 0
- New GAP: 3 (GAP-P1-001, GAP-P1-002, GAP-P1-003)
- Changed GAP: 0
- Closed GAP: 0

| GAP-ID | Prompt | Severity | Priority | Status | Краткое описание |
| ------ | ------ | -------- | -------- | ------ | ---------------- |
| GAP-P1-001 | PROMPT_1 | MEDIUM | MEDIUM | OPEN | Нет GitHub-интеграции системы AI_FACTORY |
| GAP-P1-002 | PROMPT_1 | LOW | LOW | OPEN | Agent Selector не перепроверен в аудите Prompt №1 (NOT TESTED) |
| GAP-P1-003 | PROMPT_1 | MEDIUM | MEDIUM | OPEN | system_state чтение/запись не проверены (NOT TESTED) |

---

_Backlog создан на этапе AUDIT Prompt №1. Следующие аудиты (Prompt №2–4) добавляют
новые GAP в этот же файл без удаления существующих._
