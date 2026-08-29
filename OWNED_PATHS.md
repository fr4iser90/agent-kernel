# Owned paths

Agents on `agent/*` must not change **KERNEL_OWNED** / **HUMAN_OWNED** paths.
Products copy this file and adjust the path list; keep the *idea*.

## Tags

| Tag | Meaning |
|-----|---------|
| `KERNEL_OWNED` | Laws/roles/scripts from agent-kernel — human updates kernel, then syncs |
| `HUMAN_OWNED` | CI, deploy, license, org policy — agent never patches |
| `RUN_OWNED` | Product code, tests, PROGRESS/BUGS/ADR, app config the run needs |
| `PLACEHOLDER` | Scaffold to replace when the real product starts |

## Default HUMAN_OWNED (deny on agent branches)

Protect via [`scripts/protect-owned-paths.sh`](scripts/protect-owned-paths.sh)
(diff vs `main` / merge-base):

- `.github/workflows/**` (or `.gitlab-ci.yml`, `buildkite/**`, …)
- `LICENSE`
- Root kernel mirrors: `LAWS.md`, `OWNED_PATHS.md`, `roles/**` if vendored
  read-only (or entire `vendor/agent-kernel/**`)
- Lint/format/gate config when the product marks them human
  (agents must not delete linters to silence failures)
- Deploy/hosting config the human owns (Pages base URL, Fly/K8s manifests
  marked human, etc.)

## Default RUN_OWNED

- Application source (`src/`, `app/`, `lib/`, … — product-defined)
- `tests/**`, smoke/demo artifacts the Initial requires
- `PROGRESS.md`, `BUGS.md`, `ADR/**`, feature/content docs
- Dependencies the product needs (**keep `gate` working**)

## Conflict land (if you use automerge)

When merging a conflicting `agent/*` into `main`:

1. **HUMAN_OWNED / KERNEL_OWNED** → keep **main**
2. **RUN_OWNED** → prefer **agent**
3. Re-run gate on the result; sync `agent/<run-id>` tip back to `main`

## Product override

Each product may add a short `OWNED_PATHS.local.md` or section in PROGRESS:

```text
HUMAN_OWNED += infra/terraform/**
RUN_OWNED += packages/api/**
```

Protect script should read the product list (see script header).
