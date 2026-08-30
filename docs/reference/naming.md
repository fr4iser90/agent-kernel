# Naming & sorting conventions

## Product vs pack

| Name | What | Where |
|------|------|--------|
| **agent-kernel** | Control plane product (Dashboard + API) | this git repo |
| **Lawpack** | Plantable / injectable autonomy **content pack** | `lawpack/` — contract: [`lawpack.md`](lawpack.md) |
| **Pin** | Exact Lawpack version for a project | DB (+ optional files on disk) |
| **Settings** | Operator globals (delivery, git policy, …) | [`settings.md`](settings.md) |
| **Orchestration** | Schedules, nudge, runs, global fan-out | [`orchestration.md`](../explanation/orchestration.md) |

Do **not** call the pack “boilerplate” in the UI (sounds like empty scaffold).  
Internal joke “lawpack” is **retired** → official: **Lawpack**.

**Init UI presets** (`clean` / `tracking` / `offline`) are Settings shortcuts —
not Lawpack package names. Prefer saying **tracking** over opaque “lab”.

## In this monorepo

```
agent-kernel/           # PRODUCT repo name
├── apps/api            # control plane backend
├── apps/web            # React dashboard
├── lawpack/            # ← the pack (versioned, planted elsewhere)
├── packages/           # shared TS libs (e.g. session-brief)
├── services/           # deployables (policy-proxy) — app code
├── deploy/             # Docker/Compose/Traefik for THIS product (not lawpack)
├── docs/               # product docs + ADRs
├── scripts/            # gate + pack-lawpack for THIS repo
└── tests/              # architecture tests for THIS repo
```

### Folder rules

| Path | Holds | Does not hold |
|------|--------|----------------|
| `lawpack/` | Laws for **other** products | Dashboard code, DSH fork |
| `apps/` | Runnable product apps | Law text (except reading lawpack at init) |
| `docs/` | Architecture for control plane | Per-product fantasy (that stays in products) |
| `packages/` | Publishable TS schemas/utils | UI pages |
| `services/` | Sidecar **source** (policy-proxy) | Domain logic (lives in api/domain); Compose files |
| `deploy/` | Dockerfiles, Compose, Traefik labels, `.env.example` | Application business logic |

### Docker layout (`deploy/`)

Prefer **`deploy/`** over a bare repo-root `docker-compose.yml` and over
scattering Compose next to every app. Matches the DSH fork’s `deploy/` habit.

```
deploy/
├── README.md                 # local smoke + server/Traefik notes
├── Dockerfile.api            # or multi-stage shared
├── Dockerfile.web            # optional; or nginx serving web dist
├── compose.yml               # local: api + web (+ optional proxy)
├── compose.server.yml        # override: Traefik network, volumes
└── .env.example
```

| Put here | Put elsewhere |
|----------|----------------|
| How to run the control plane in Docker | `apps/*` source |
| Volume / `WORKSPACE_ROOT` notes | Host data dirs (never commit workspace clones) |
| Server attach to existing `proxy` network | DSH image itself (stays in deepseek-harness `deploy/`) |

Root-level `compose.yml` symlink to `deploy/compose.yml` is optional convenience
only — canonical files live under `deploy/`.

Do **not** use top-level `docker/` unless you strongly prefer that name; if you
do, treat it as an alias of this `deploy/` role (one folder, not both).

## When laws land in a product repo

Depends on Init **injection mode** ([ADR-0004](../adr/0004-dual-injection-multi-executor.md),
[`operating-model.md`](../explanation/operating-model.md)):

- **`repo_plant`** — layout below (committed `vendor/lawpack/` or submodule).  
- **`harness_inject`** — usually only PROGRESS/BUGS/ADAPTER (+ optional thin
  AGENTS); Lawpack arrives at run time (ephemeral / gitignored `.agent/lawpack`).

### `repo_plant` layout

```
my-product/
├── vendor/lawpack/           # pinned copy (or git submodule)
│   ├── LAWPACK_VERSION       # sha or semver
│   ├── LAWS.md
│   ├── OWNED_PATHS.md
│   ├── roles/
│   ├── adapters/
│   ├── examples/prompts/
│   └── scripts/
├── AGENTS.md                 # thin: “obey vendor/lawpack/LAWS.md; RUN_ID=…”
├── ADAPTER.md                # product-generated (stack, gate, deploy_url)
├── PROGRESS.md               # RUN_OWNED
├── BUGS.md                   # RUN_OWNED
├── ADR/                      # optional, product decisions
└── … product source …
```

Plant-path alternatives (document in ADAPTER):

- `vendor/lawpack/` — clear default for repo_plant  
- `.agent/lawpack/` — less visible / often gitignored under harness_inject  
- git submodule at `vendor/lawpack` → tracks `agent-kernel` path `lawpack/`

**Never** scatter roles at product root without a version file (when planted).

## What we keep in Lawpack (sort)

| Keep | Role |
|------|------|
| `LAWS.md` | Generic constitution |
| `profiles/games.md` | Optional lab/game ACCEPT overlay |
| `OWNED_PATHS.md` | Deny list template |
| `RUNTIME.md` | DSH/VS Code expectations |
| `roles/*.md` | Machine roles (followup, fix, feature, validate, demo, arch) |
| `adapters/` | Stack stubs / template |
| `examples/prompts/` | Initial / Followup / fix templates |
| `scripts/assert-run-id.sh` | Branch pin |
| `scripts/protect-owned-paths.sh` | Owned-path guard |
| `LESSONS.md` | Failure modes (agents may read) |
| `MIGRATION.md` | Manual attach without UI |

| Move / don’t plant | Why |
|--------------------|-----|
| Control-plane `docs/*` | Product of agent-kernel, not every app |
| `apps/`, `services/` | Not laws |

## Control-plane domain names (stable)

Use these IDs in code + DB (English, kebab in paths, Pascal in types):

| Domain folder | Type prefix example | UI label |
|---------------|---------------------|----------|
| `catalog` | `Project` | Projects |
| `provisioning` | `InitJob`, `LawpackPin` | Initialize |
| `profiles` | `AgentProfile`, `Workflow` | Profiles / Agents |
| `policy` | `SessionBrief`, `OwnedPath` | Policy |
| `orchestration` | `Run`, `NudgeSchedule` | Runs / Nudge |
| `observability` | `GateStatus`, `WidgetLayout` | Dashboard |
| `knowledge` | `CodegraphConfig` | Codegraph |
| `identity` | `User`, `Acl` | Login / access (v1: stub `local-owner` only — ADR-0003) |

Profiles **library** (tracking-cycle, fix-only, docs, security) lives in
**control plane** DB/content — they *reference* lawpack roles, they are not
duplicates of `lawpack/roles/` files.

## File naming

| Kind | Convention |
|------|------------|
| **Repo root** | `README.md`, `LICENSE` — traditional uppercase basenames only here |
| **`docs/`** | Diátaxis: `tutorials/`, `how-to/`, `reference/`, `explanation/`, `adr/` — all `kebab-case.md` |
| **`docs/*.md` (legacy flat)** | **Forbidden** — do not add new peer files at `docs/` root except `index.md` / `readme.md` |
| **`docs/adr/`** | `NNNN-kebab-title.md` |
| **`docs/` index** | [`readme.md`](../readme.md) |
| Lawpack entrypoints | `LAWS.md`, `OWNED_PATHS.md`, … may stay uppercase (pack surface, not control-plane docs) |
| Roles | `roles/<role>.md` lowercase |
| TS modules | prefer **kebab** for new files |
| Pack artifact | `lawpack-<version>.tar.gz` via `scripts/pack-lawpack.sh` |

Rationale: modern documentation sets (MkDocs/Docusaurus/Diátaxis-style trees) use
lowercase kebab filenames under `docs/`. Uppercase is reserved for a few VCS
root sentinels, not the whole manual.

## Versioning

- **Lawpack:** content hash or `lawpack/VERSION` semver when you cut releases  
- **Control plane app:** normal semver / git tags on `agent-kernel`  
- Init stores both: `lawpack_version` + `planted_at` on the Project  

## UI copy

- English for **all docs** and default UI strings (never author docs in German)  
- English code identifiers  
- Product UI localization (if any) is a later i18n concern — not mixed into `docs/`  
