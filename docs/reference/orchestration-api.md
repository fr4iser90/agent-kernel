# Orchestration API — global fan-out & schedules

**Diátaxis:** reference. Product terms:
[`../explanation/orchestration.md`](../explanation/orchestration.md).
Schemas: [`schemas/assignment.schema.json`](schemas/assignment.schema.json),
[`schemas/run.schema.json`](schemas/run.schema.json). OpenAPI:
[`schemas/openapi.yaml`](schemas/openapi.yaml).

Language: English. Normative: [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Global assignment fan-out (layer E)

A **global** assignment has `projectId: null`. It does **not** run once in a
void — Orchestration **expands** it into N project-scoped runs.

### Selection (`FanOutSelector`)

Stored on the global assignment (or linked `fanOut` object):

| Mode | Field | Behaviour |
|------|-------|-----------|
| `all_initialized` | — | Every catalog project with Init applied (has lawpack pin) |
| `tag` | `tags: string[]` | Projects whose `userTags` / meta tags intersect (OR) |
| `allow_list` | `projectIds: string[]` | Exact ids only |
| `deny_list` | `excludeProjectIds: string[]` | Applied **after** mode filter |

**MUST** skip: uninitialized projects, paused projects (if flagged), projects
failing hard preflight (path missing / clone fail) unless `force: true`.

```text
Global Assignment
  → resolve target set (mode + deny_list)
  → for each projectId:
        clone Assignment view (same profile/schedule/reviewMode)
        → Brief → Policy → ExecutorPort
        → one Run row per project
```

### HTTP (normative additions)

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/assignments` | Create; omit `projectId` for global + body `fanOut` |
| `POST` | `/api/assignments/{id}/nudge` | Fan-out nudge → multiple Runs |
| `GET` | `/api/assignments/{id}/targets` | Preview resolved project ids (dry) |

`fanOut` schema (logical):

```json
{
  "mode": "all_initialized | tag | allow_list",
  "tags": ["prod"],
  "projectIds": [],
  "excludeProjectIds": [],
  "force": false
}
```

Machine file: extend Assignment schema with optional `fanOut` (see
`assignment.schema.json`).

---

## 2. Schedules

| Rule | Requirement |
|------|-------------|
| Schedule fields live on **Assignment** | `scheduleMode`, `cronExpr`, `paused` |
| Orchestration owns **firing** | Cron/infinite/once → create nudge intents |
| Execution | Always `Assignment` → Brief → Policy → `ExecutorPort` |
| Global + schedule | Each tick runs fan-out (§1) |

Implementation of the scheduler loop is **M4 code** — this doc is the contract.

---

## 3. Non-goals

- Separate “global run” without per-project Brief  
- Fan-out into uninitialized repos by default  
- Coding inside orchestration  
