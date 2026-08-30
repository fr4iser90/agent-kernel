# Doc freeze — implementation gate

Until the items below are accepted in docs, **do not expand control-plane
behavior** that invents policy (git, protect, layout, presets). Scaffold that
already exists may stay, but new features must follow these docs.

## Must be true in docs first

- [x] Persistence map + ADR-0005 (SQLite local / Postgres server)  
- [x] Docs coverage 100% architecture phase ([docs-coverage.md](docs-coverage.md))  
- [x] Dual delivery ([ADR-0004](../adr/0004-dual-injection-multi-executor.md), [operating-model.md](operating-model.md))  
- [x] Settings schema + anti-hardcode ([settings.md](../reference/settings.md))  
- [x] Lawpack generic contract + MVP honesty ([lawpack.md](../reference/lawpack.md))  
- [x] Pack `MANIFEST.json` under `lawpack/` + contract in lawpack.md  
- [x] INIT presets = Settings language (`clean` / `tracking` / `offline`; profile `tracking-cycle`)  
- [x] Diátaxis docs layout + reference schemas (OpenAPI / JSON Schema)  
- [x] UI Settings page specified 1:1 against settings.md ([settings-ui.md](settings-ui.md))  
- [x] Git policy default **off**; protect never implied  

## Rule for agents / humans

**Docs-first.** No “helpful” Init/git/protect coding that contradicts settings.md /
lawpack.md unless the operator lifts this freeze.
