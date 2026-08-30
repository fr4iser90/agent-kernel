# ADR-0005: Persistence — SQLite local, Postgres server

## Status

**Accepted** (2026-08-30) — docs-architecture phase.

## Context

- ADR-0002 pinned **SQLite** for local-first v1; architecture said “Postgres later”
  without a cutover rule.
- PIDEA used **SQLite for development** and **PostgreSQL for production**, with
  prompts on the **filesystem** (`content-library`), not as SQL SoT.
- Operator fear: SQLite “drowns” under many agent requests. Clarification needed:
  coding traffic hits **executor + GateWay**, not the control-plane DB. The DB
  holds **metadata** (projects, settings, assignments, run rows). Many parallel
  **nudges / run writes / operator chat** on a remote host still argue for
  Postgres.

## Decision

| Topology | Database |
|----------|----------|
| **L-native / L-docker** (single operator, local) | **SQLite** (`DB_PATH` / volume) |
| **Remote (S) / always-on / M6 multi-user** | **Postgres** (`DATABASE_URL`) |
| Policy-proxy | **No** database |
| Law / role / prompt bodies | **Lawpack files** (or ephemeral inject) — not SQL SoT |

Rules:

1. One **logical** schema (Drizzle or equivalent) with two drivers — same
   entities as [`../reference/data-model.md`](../reference/data-model.md).  
2. App **MUST** select engine via config (`DATABASE_URL` present ⇒ Postgres;
   else SQLite).  
3. SessionBrief **snapshots** on `Run` are allowed; full prompt libraries are not.  
4. Do **not** import PIDEA’s task-queue-as-SoT model.

## Consequences

- Docs and deploy: SQLite volume for local Compose; Postgres service/env on
  remote profile (when implemented).  
- ADR-0002 remains valid for local-first default; this ADR owns **when** to
  leave SQLite.  
- Implementation deferred until docs freeze lifts — schema docs first.
