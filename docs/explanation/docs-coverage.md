# Docs coverage — architecture phase checklist

**Diátaxis:** explanation. Goal: **docs complete** before feature coding that
invents policy or persistence. Freeze: [`doc-freeze.md`](doc-freeze.md).

## Status: **100% docs coverage (architecture phase)**

All items below are specified. Implementation code remains frozen until the
operator lifts [`doc-freeze.md`](doc-freeze.md).

### Baseline

- [x] Diátaxis + VitePress + link check  
- [x] Settings / Init / Settings-UI  
- [x] Orchestration / operating-model / actors  
- [x] Lawpack MANIFEST + generic LAWS + lab profile  
- [x] Deploy Compose (Traefik external)  
- [x] Policy-proxy contract  
- [x] Persistence map + ADR-0005  
- [x] Getting-started success + health + backup how-tos  

### Persistence & APIs

- [x] `data-model.md` store matrix + entities  
- [x] SessionBrief / Assignment / Run / Profile / Audit / ProjectFacts schemas  
- [x] OpenAPI: Settings, Init, Projects, Assignments, Brief, Nudge, Runs, Profiles, Attention, Audit  
- [x] `inject-runtime.md`  
- [x] `operator-tools.md` (chat ↔ API 1:1)  
- [x] Remote Compose Postgres sketch (`--profile postgres` + `DATABASE_URL`)  
- [x] Domain READMEs → architecture + data-model  
- [x] Orchestration fan-out + schedule **contract** (`orchestration-api.md`)  

## Not docs gaps (implementation milestones)

Open `[ ]` in `roadmap.md` / `ui.md` mean **code not written yet**. They are
covered by specs (settings, openapi, operator-tools, orchestration-api). Do
**not** treat them as missing architecture docs.


- GitHub Actions CI  
- Implementing Settings/Init/Executor/proxy **code**  
- PIDEA wholesale import  

## PIDEA → agent-kernel (storage)

| PIDEA | agent-kernel |
|-------|----------------|
| SQLite dev / Postgres prod | ADR-0005 |
| Prompts on filesystem | Lawpack MD |
| Tasks/chat in SQL | Assignments + Runs (+ optional operator chat) |
| Task-queue as SoT | Rejected |
| IDE coding chat in control plane | Rejected |
