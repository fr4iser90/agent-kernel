# Roadmap (draft)

## M0 — Docs + tree (current)

- [x] lawpack (Lawpack) law pack  
- [x] VISION / ARCHITECTURE / TREE / NAMING / COMPARABLES / INTEGRATIONS  
- [x] ADR-0001 control plane vs lawpack  
- [x] ADR-0002 stack pin (TS API + React web)  
- [x] Empty DDD dirs + gate scaffold  

## M1 — Catalog + init **in the web dashboard** (local)

Product surface is the **UI**, not a CLI-first admin. API exists for the UI
(and later DSH/proxy); humans manage projects in the dashboard.

- Register local / git-connected project (from UI)  
- Deterministic stack sniff (+ optional LLM assist)  
- Init from UI: plant lawpack pin + PROGRESS/BUGS/ADAPTER + RUN_ID  
- Dashboard shows project list + init status  

## M2 — Profiles + policy brief (UI + API)

- Profile library (lab-cycle, fix-only, docs, security) — assignable per project in UI  
- SessionBrief schema + dry-run from dashboard  
- protect/assert verification visible as green/red  

## M3 — Configurable dashboard

- Widgets: gate, bugs, branch, last run, security, codegraph (user picks layout)  
- Preferences persisted  

## M4 — Orchestration + DSH

- Nudge scheduler (UI-configurable)  
- Policy proxy MVP (local)  
- Attach/start DSH session with brief  

## M5 — Knowledge (optional)

- Size threshold config in UI  
- Embed via GateWay / llama.cpp  
- Search API for agents (MCP later)  

## M6 — Remote harden

- Deploy beside DSH behind Traefik  
- Login / ACL / audit  
- AgentLayer security workflow hooked  

Do **not** ship “CLI-only MVP” as the product. Thin `scripts/` for gate/pack
are fine; day-to-day UX is the web dashboard.
