# Documentation index

Diátaxis hub: **[`index.md`](index.md)** (also VitePress home).

**Language:** English only. **Filenames:** `kebab-case.md` — [`reference/naming.md`](reference/naming.md).

| Quadrant | Start |
|----------|--------|
| Tutorial | [`tutorials/getting-started.md`](tutorials/getting-started.md) |
| How-to | [`how-to/init.md`](how-to/init.md), [`how-to/assign-agent.md`](how-to/assign-agent.md), [`how-to/nudge-run.md`](how-to/nudge-run.md), [`how-to/check-health.md`](how-to/check-health.md) |
| Reference | [`reference/settings.md`](reference/settings.md), [`reference/schemas/readme.md`](reference/schemas/readme.md) |
| Explanation | [`explanation/vision.md`](explanation/vision.md), [`explanation/orchestration.md`](explanation/orchestration.md) |
| ADRs | [`adr/0001-control-plane-vs-lawpack.md`](adr/0001-control-plane-vs-lawpack.md) |

### `getting-started` vs `init`

| | Tutorial | How-to Init |
|--|----------|-------------|
| Scope | Machine/stack + Login + setup wizard + day-1 | **One project** after it exists in Catalog |
| When | Before/while bringing the control plane up | After Login + Settings, per project |
