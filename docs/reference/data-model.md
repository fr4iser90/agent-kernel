# Persistence & data model

**Diátaxis:** reference. Explains **what is stored where** when agent-kernel
is the middleman. Actors: [`../explanation/actors.md`](../explanation/actors.md).
Stack pin: [ADR-0002](../adr/0002-stack-pin.md). Storage strategy:
[ADR-0005](../adr/0005-persistence-sqlite-postgres.md).

Language: English. Normative: [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Middleman role (what hits the DB)

```text
Human / Operator LLM
        │  CRUD + nudge
        ▼
 agent-kernel API  ──reads/writes──►  Control-plane DB
        │                              (catalog, settings, pins,
        │                               assignments, run metadata)
        │  authorize in-process
        ▼
 ExecutorPort (DSH / …)  ──Brief──►  Product workdir + Lawpack
                                     (prompts/laws on disk or inject)
```

| Traffic | Goes to control-plane DB? |
|---------|-------------------------|
| Register project, Settings, Init pin, assignments | **Yes** |
| Build SessionBrief at nudge | **Read** DB + Lawpack; Brief itself MAY be snapshotted on Run |
| Coding-agent tool calls / token streams | **No** — executor ↔ GateWay |
| Law / role / prompt **bodies** | **No** — Lawpack files (or ephemeral inject), not rows of prompt text |
| PROGRESS/BUGS content | Product git or kernel tracking records per inject strength — **not** a PIDEA-style task-queue SoT |

**PIDEA lesson (steal pattern, not monolith):** dual DB for app metadata;
**prompts on filesystem** (`content-library`). agent-kernel keeps laws/prompts
in **Lawpack MD**, metadata in SQL — see [`../explanation/integrations.md`](../explanation/integrations.md).

---

## 2. Store matrix (canonical)

| Data | Store | Notes |
|------|--------|------|
| Settings document | Control-plane DB | `schemaVersion`; SoT after first wizard save |
| Projects (catalog) | DB | path / gitRemote, sniff meta, `ownerId` |
| Lawpack **pin** (id, version, hash) | DB | Content files stay in pack store / planted tree |
| Law / role / prompt **text** | Lawpack files | **MUST NOT** duplicate full MD into SQL as SoT |
| Agent profiles (library) | DB | References role path / pack pin; optional template ids |
| Assignments | DB | project × profile × schedule × reviewMode × runId |
| Nudge schedules / pause | DB | Orchestration |
| **Run** records | DB | ids, times, outcome, executor session id, brief hash/ref |
| SessionBrief | Built at nudge; **snapshot on Run** | Proxy does not own storage |
| Operator chat threads (later) | DB | Optional; not coding transcript |
| Analyzer `facts_json` | DB on project | Deterministic sniff cache |
| Widget layout / attention prefs | DB (Settings / observability) | |
| Audit (who nudged / denied) | DB | M6 harden; shape below |
| Product source | Product git | Executor workdir |
| Tracking MD (PROGRESS/BUGS) | Product git **or** DB records | Per `injectStrength` / preset |
| Ephemeral inject pack | tmp / gitignored mount | TTL = session; proxy/API materializes |
| Secrets | Env / keyring / GateWay refs | **MUST NOT** live in git or Lawpack |
| GateWay model traffic | GateWay | Outside this DB |

---

## 3. Entity catalog (control-plane DB)

Logical tables (names illustrative; migrations own physical DDL):

| Entity | Key fields (min) |
|--------|------------------|
| `User` | `id` (`local-owner` v1), … |
| `Settings` | `schemaVersion`, JSON document or columns matching settings schema |
| `Project` | `id`, `ownerId`, `name`, `path`, `gitRemote`, sniff JSON, `lawpackPin`, init snapshot |
| `LawpackPin` | `id`, `packId`, `version`, `contentHash`, `source` |
| `AgentProfile` | `id`, `rolePath`, defaults, labels |
| `Assignment` | `id`, `projectId` \| global scope, `profileId`, `scheduleMode`, `cron`, `reviewMode`, `runId`, `paused` |
| `Run` | `id`, `assignmentId`, `projectId`, `startedAt`, `endedAt`, `outcome`, `executorId`, `executorSessionId`, `briefHash`, `denyReason` |
| `AuditEvent` | `id`, `at`, `actorId`, `kind`, `payload` (Brief allow/deny, settings change) |

OpenAPI + JSON Schema for Settings, Init, Assignments, Runs, Profiles, Brief,
Audit, and ProjectFacts live under `reference/schemas/` (see `openapi.yaml`).

---

## 4. Prompts — taxonomy

| Kind | Location | Loaded by |
|------|----------|-----------|
| Lawpack examples | `lawpack/examples/prompts/*` | Init / profiles |
| Role instructions | `lawpack/roles/*.md` | Brief / inject |
| Lab ACCEPT overlay | `lawpack/profiles/games.md` | Optional profile |
| Product Initial / Followup stubs | Product tree or Brief | Coding agent |
| Operator-LLM system prompts | Control plane config (later) | GateWay operator path |

Control plane **MUST NOT** treat SQL as the authoring SoT for law/role prose.

---

## 5. Start-policy persistence

| Concern | Rule |
|---------|------|
| Durable store | **MUST NOT** — authorize is in-process, no sidecar DB |
| Brief source | Built by API from assignment/run ids |
| Allow/deny audit | Written by **API** only |
| Inject cache | Optional tmp only; no cross-reboot SoT |

Contract: [`start-policy.md`](start-policy.md).

---

## 6. SQLite vs Postgres (summary)

See **[ADR-0005](../adr/0005-persistence-sqlite-postgres.md)**.

| Topology | Engine |
|----------|--------|
| L-native / L-docker single operator | **SQLite** |
| Remote always-on / multi-writer / M6 | **Postgres** |

Coding-agent **token volume does not land in this DB**. Risk to SQLite is
**many concurrent control-plane writers** (nudges, run rows, chat), not DSH
tool spam. Postgres is the server default so metadata does not become the
bottleneck when many assignments fire.

---

## 7. Backup

| Engine | Backup |
|--------|--------|
| SQLite | Copy `DB_PATH` / volume `ak-data` while API stopped (or online backup API later) |
| Postgres | Standard dump / volume snapshots |

---

## 8. Non-goals

- Second **task queue** DB that fights PROGRESS/BUGS (PIDEA lesson)  
- Storing full coding transcripts in kernel DB  
- Prompt CMS inside SQL  
