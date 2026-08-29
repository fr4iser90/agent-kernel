# Naming & sorting conventions

## Product vs pack

| Name | What | Where |
|------|------|--------|
| **agent-kernel** | Control plane product (Dashboard + API) | this git repo |
| **Lawpack** | Plantable autonomy laws (roles, scripts, …) | `lawpack/` in this repo |
| **Pin** | Exact Lawpack version planted into a product | recorded in product + DB |

Do **not** call the pack “boilerplate” in the UI (sounds like empty scaffold).  
Internal joke “lawpack” is **retired** → official: **Lawpack**.

## In this monorepo

```
agent-kernel/           # PRODUCT repo name
├── apps/api            # control plane backend
├── apps/web            # React dashboard
├── lawpack/            # ← the pack (versioned, planted elsewhere)
├── packages/           # shared TS libs (e.g. session-brief)
├── services/           # deployables (policy-proxy)
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
| `services/` | Sidecars (proxy) | Domain logic (lives in api/domain) |

## When planted into a product repo

Default layout after Init:

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

Alternatives (pick one per product, document in ADAPTER):

- `vendor/lawpack/` — **default** (clear, not hidden)  
- `.agent/lawpack/` — if you want it less visible  
- git submodule at `vendor/lawpack` → tracks `agent-kernel` path `lawpack/`

**Never** scatter roles at product root without a version file.

## What we keep in Lawpack (sort)

| Keep | Role |
|------|------|
| `LAWS.md` | Constitution |
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

| Domain folder | Type prefix example | UI label (DE ok) |
|---------------|---------------------|------------------|
| `catalog` | `Project` | Projekte |
| `provisioning` | `InitJob`, `LawpackPin` | Initialisierung |
| `profiles` | `AgentProfile`, `Workflow` | Profile / Agenten |
| `policy` | `SessionBrief`, `OwnedPath` | Policy |
| `orchestration` | `Run`, `NudgeSchedule` | Läufe / Nudge |
| `observability` | `GateStatus`, `WidgetLayout` | Dashboard |
| `knowledge` | `CodegraphConfig` | Codegraph |
| `identity` | `User`, `Acl` | Login / Rechte |

Profiles **library** (lab-cycle, fix-only, docs, security) lives in
**control plane** DB/content — they *reference* lawpack roles, they are not
duplicates of `lawpack/roles/` files.

## File naming

| Kind | Convention |
|------|------------|
| Docs | `SCREAMING` only for law entrypoints (`LAWS.md`); else `Title.md` / `kebab.md` |
| Roles | `roles/<role>.md` lowercase |
| ADRs | `docs/adr/NNNN-kebab.md` |
| TS modules | `camelCase` files or `kebab` — pick one in ADR-0002 follow-up; prefer **kebab** for new files |
| Pack artifact | `lawpack-<version>.tar.gz` via `scripts/pack-lawpack.sh` |

## Versioning

- **Lawpack:** content hash or `lawpack/VERSION` semver when you cut releases  
- **Control plane app:** normal semver / git tags on `agent-kernel`  
- Init stores both: `lawpack_version` + `planted_at` on the Project  

## UI copy

- English code identifiers; German UI strings fine  
- Say **Lawpack** / **Laws**, not “Boilerplate” / “Lawpack”  
