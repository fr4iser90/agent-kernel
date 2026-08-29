# ADR-0002: Stack pin — deferred

## Status

Proposed — **do not implement apps until accepted**

## Options

| Option | Pros | Cons |
|--------|------|------|
| A. TS API (Hono/Fastify) + Vite React + SQLite | Fits web dashboard; one language with boilerstuff scripts in bash | Less overlap with AgentLayer/GateWay Python |
| B. Python API (FastAPI) + Vite React + SQLite | Aligns with GateWay/AgentLayer; easier tool clients | Two languages in monorepo |
| C. Python full-stack (HTMX/templates) | Fastest local admin | Weaker configurable dashboard |

## Recommendation (pending human)

**B** if AgentLayer/security workflows are first-class in M4–M6; **A** if
dashboard polish and shared SessionBrief npm package matter more.

## Decision

_TBD — fill before first `apps/api` code._
