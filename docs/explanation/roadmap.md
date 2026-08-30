# Roadmap (draft)

**Now: docs.** See [`doc-freeze.md`](doc-freeze.md). Do not invent git/protect/layout
in code until Settings + Lawpack contract are accepted.

## M0 — Docs + tree

- [x] Lawpack MVP tree + `MANIFEST.json`  
- [x] Diátaxis docs (`tutorials` / `how-to` / `reference` / `explanation`)  
- [x] Reference schemas (JSON Schema + OpenAPI)  
- [x] VitePress + doc link check in gate  
- [x] `deploy/` Compose (L-docker + server override)  
- [x] ADRs 0001–0004  
- [x] Settings / Lawpack / getting-started / orchestration / operating-model  
- [x] Init presets = `clean` / `tracking` / `offline`; profile `tracking-cycle`  
- [x] ADR-0005 persistence + data-model + full OpenAPI/schemas + operator-tools  
- [x] Remote Postgres Compose profile sketch  


## M1 — Catalog + init **in the web dashboard** (local)

Scaffold exists; **re-align to Settings/Lawpack before more Init features.**

- [x] Scaffold TS API (Hono) + React/Vite dashboard + SQLite  
- [x] Register local project  
- [x] Deterministic stack sniff  
- [ ] Init matches Settings (no silent git police; presets tracking/clean/offline)  
- [ ] List shows status / lawpack pin / sniff meta  

## M2 — Profiles + policy brief (UI + API)

- [x] Profile library + schedules stored  
- [x] SessionBrief dry-run  
- [ ] Protect/assert **only if** Settings git policy enabled  
- [ ] Actual cron/nudge executor (M4)

## M3 — Configurable dashboard

See [`ui.md`](ui.md), [`../reference/analyzer.md`](../reference/analyzer.md),
[`../reference/settings.md`](../reference/settings.md).

- [ ] `/settings` page = settings schema  
- App shell / Overview / detail against ui.md  
- Analyzer facts / preferences / compliance  

## M4 — Orchestration + DSH

- [x] Nudge scheduler (cron / infinite / once / manual)
- [x] In-process start policy before ExecutorPort (no sidecar)
- [x] Attach/start DSH session with brief (`dsh` executor)
- [x] Review queue: `llm_propose` → awaiting_review → approve/reject
- [ ] Operator chat tools (optional later)

## M5 — Knowledge (optional)

- Size threshold, embed, search  

## M6 — Remote harden

- Deploy beside DSH, real login/ACL/audit  

Do **not** ship “CLI-only MVP” as the product. Day-to-day UX is the web dashboard.
