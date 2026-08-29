# ADR-0002: Stack pin

## Status

**Accepted** (2026-08-29) — human: prefer TypeScript; product is a web dashboard.

## Decision

| Layer | Choice |
|-------|--------|
| API | **TypeScript** (Hono or Fastify) |
| Web UI | **React** + Vite |
| DB (local-first) | SQLite (e.g. Drizzle) |
| Pack scripts | Bash (already in `boilerstuff/scripts`, `scripts/`) |

## Why TypeScript

- One language for API + dashboard + SessionBrief package  
- Fits a configurable web UI as the primary product surface  
- AgentLayer/GateWay stay **HTTP clients** from TS (no need to be Python to call them)

## What React is (for this repo)

**React** = JavaScript/TypeScript library to build interactive UIs from
components (project cards, widgets, settings). The browser shows your
dashboard; React updates parts of the page when data changes (gate red/green,
project list) without full reloads. **Vite** is the build tool that serves/
bundles that React app in `apps/web`.

Alternatives (Vue/Svelte) work too; React is the common default and matches
option A we documented.

## Explicitly rejected for v1

- **CLI-first product** — humans use the dashboard; CLI is not the init UX  
- **Python API as core** — optional later workers OK; control plane is TS  
- **HTMX-only admin** — too weak for configurable multi-widget dashboard  

## Consequences

- Implement `apps/api` and `apps/web` in TypeScript after this ADR  
- Architecture/LOC tests in TS/vitest (PIDEA ideas, new code)  
- Python AgentLayer/GateWay = external services over HTTP  
