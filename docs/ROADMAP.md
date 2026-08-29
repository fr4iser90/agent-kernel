# Roadmap (draft)

## M0 — Docs + tree (current)

- [x] boilerstuff law pack  
- [x] VISION / ARCHITECTURE / TREE / COMPARABLES / INTEGRATIONS  
- [ ] ADR-0001 control plane vs boilerstuff  
- [ ] ADR-0002 stack pin  
- [ ] Empty DDD dirs + architecture test stubs  

## M1 — Catalog + init (local)

- Register local git project  
- Deterministic stack sniff  
- Init: plant boilerstuff pin + PROGRESS/BUGS/ADAPTER + RUN_ID  
- CLI acceptable before full UI  

## M2 — Profiles + policy brief

- Profile library (lab-cycle, fix-only, docs, security)  
- SessionBrief schema + dry-run  
- protect/assert scripts invoked from init verification  

## M3 — Dashboard v1

- Configurable widgets (gate, bugs, branch, last run)  
- Preferences persisted  

## M4 — Orchestration + DSH

- Nudge scheduler  
- Policy proxy MVP (local)  
- Attach/start DSH session with brief  

## M5 — Knowledge (optional)

- Size threshold config  
- Embed via GateWay / llama.cpp  
- Search API for agents (MCP later)  

## M6 — Remote harden

- Deploy beside DSH behind Traefik  
- Login / ACL / audit  
- AgentLayer security workflow hooked  

Slash scope aggressively; M1–M2 before pretty UI.
