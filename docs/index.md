# Documentation

**Language:** English only in `docs/`.  
**Layout:** [Diátaxis](https://diataxis.fr/) — tutorials, how-to, reference, explanation.  
**Filenames:** `kebab-case.md` — see [`reference/naming.md`](reference/naming.md).

GitHub browsing: this file is the VitePress home. Flat index mirror: [`readme.md`](readme.md).

---

## Tutorials — learning-oriented

| Doc | Purpose |
|-----|---------|
| [`tutorials/getting-started.md`](tutorials/getting-started.md) | Install topologies → Login → setup → first project; **success criteria** |

## How-to guides — goal-oriented

| Doc | Purpose |
|-----|---------|
| [`how-to/init.md`](how-to/init.md) | Initialize **one** project (wizard + Init API) |
| [`how-to/assign-agent.md`](how-to/assign-agent.md) | Assign profile + schedule to a project |
| [`how-to/nudge-run.md`](how-to/nudge-run.md) | Nudge / start a run via ExecutorPort |
| [`how-to/check-health.md`](how-to/check-health.md) | Smoke-check API/Web (`pnpm health`) |
| [`how-to/backup.md`](how-to/backup.md) | Backup/restore control-plane DB |
| [`how-to/run-the-gate.md`](how-to/run-the-gate.md) | Run quality gate / pre-commit |

## Reference — technical description

| Doc | Purpose |
|-----|---------|
| [`reference/settings.md`](reference/settings.md) | Global settings schema, git policy, anti-hardcode |
| [`reference/schemas/readme.md`](reference/schemas/readme.md) | JSON Schema + OpenAPI for Settings / Init |
| [`reference/lawpack.md`](reference/lawpack.md) | Pack contract + `MANIFEST.json` |
| [`reference/data-model.md`](reference/data-model.md) | What is stored where (DB vs files vs proxy) |
| [`reference/inject-runtime.md`](reference/inject-runtime.md) | harness_inject materialization |
| [`reference/policy-proxy.md`](reference/policy-proxy.md) | Authorize + Brief before executor |
| [`reference/orchestration-api.md`](reference/orchestration-api.md) | Fan-out + schedule contract |
| [`reference/operator-tools.md`](reference/operator-tools.md) | Operator chat tools ↔ API |
| [`reference/analyzer.md`](reference/analyzer.md) | Facts, preferences, advice |
| [`reference/naming.md`](reference/naming.md) | Product names, paths, filename rules |
| [`reference/tree.md`](reference/tree.md) | Repository tree target |

## Explanation — understanding-oriented

| Doc | Purpose |
|-----|---------|
| [`explanation/vision.md`](explanation/vision.md) | Product one-liner and non-goals |
| [`explanation/architecture.md`](explanation/architecture.md) | Context map, DDD, B-first delivery |
| [`explanation/orchestration.md`](explanation/orchestration.md) | **Canonical** project/agent terms + layers A–F |
| [`explanation/actors.md`](explanation/actors.md) | Human vs AI — who needs what / who owns what |
| [`explanation/docs-coverage.md`](explanation/docs-coverage.md) | Docs-phase checklist — what remains before code |
| [`explanation/operating-model.md`](explanation/operating-model.md) | Injection modes + Settings vs project (no install list) |
| [`explanation/ui.md`](explanation/ui.md) | Routes, Login-first, operator vs coding chat |
| [`explanation/settings-ui.md`](explanation/settings-ui.md) | `/settings` page 1:1 with settings schema |
| [`explanation/runtime-topology.md`](explanation/runtime-topology.md) | Local vs remote Docker, volumes, Traefik |
| [`explanation/integrations.md`](explanation/integrations.md) | DSH, GateWay, AgentLayer |
| [`explanation/roadmap.md`](explanation/roadmap.md) | Milestones |
| [`explanation/doc-freeze.md`](explanation/doc-freeze.md) | Implementation gate |
| [`explanation/comparables.md`](explanation/comparables.md) | Similar projects |

## Decisions

| Doc | Purpose |
|-----|---------|
| [`adr/0001-control-plane-vs-lawpack.md`](adr/0001-control-plane-vs-lawpack.md) | Architecture decision records (`NNNN-kebab.md`) |

### Doc ownership (no duplication)

| Concern | Canonical doc |
|---------|----------------|
| Product terms / layers A–F | `explanation/orchestration.md` |
| Human vs AI ownership | `explanation/actors.md` |
| Injection / Settings vs Init snapshot | `explanation/operating-model.md` |
| Machine install + first Login/wizard | `tutorials/getting-started.md` |
| Per-project Init fields / API | `how-to/init.md` |
| Settings keys | `reference/settings.md` + schemas |
