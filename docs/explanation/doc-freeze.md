# Doc freeze — implementation gate

## Status: **LIFTED for implementation** (2026-08-30)

Operator authorized coding: full product surface (Settings, Login, Setup wizard,
Init, Assignments/Runs, ExecutorPort→DSH real, Operator chat).  
**No fake executors / no silent policy fallbacks.** Follow specs below.

## Specs that remain normative

- [x] Persistence map + ADR-0005  
- [x] Docs coverage architecture ([docs-coverage.md](docs-coverage.md))  
- [x] Dual delivery ADR-0004 + operating-model  
- [x] Settings schema + anti-hardcode ([settings.md](../reference/settings.md))  
- [x] Lawpack contract + MANIFEST  
- [x] Init presets `clean` / `tracking` / `offline`  
- [x] OpenAPI + JSON schemas  
- [x] Settings UI + Login-first  
- [x] Git policy default **off**  

## Rule for agents / humans

Implement **against** OpenAPI / settings.md / data-model.md.  
Do **not** invent git/protect/layout defaults that contradict Settings.  
Do **not** ship FakeExecutor or “always allow” policy shortcuts.
