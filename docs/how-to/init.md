# Init wizard — human UX + LLM API

**Diátaxis:** how-to. Install/Login journey:
[`../tutorials/getting-started.md`](../tutorials/getting-started.md). Schema:
[`../reference/schemas/init.schema.json`](../reference/schemas/init.schema.json).

How initialization should feel for people, what Lawpack-related choices belong
where (global vs project), and how the **same contract** serves operator LLMs.

Related: [`../explanation/operating-model.md`](../explanation/operating-model.md),
[`../explanation/ui.md`](../explanation/ui.md),
[`../reference/settings.md`](../reference/settings.md),
[`../reference/lawpack.md`](../reference/lawpack.md),
[`../adr/0004-dual-injection-multi-executor.md`](../adr/0004-dual-injection-multi-executor.md).

**Docs language: English only.**

---

## 1. Design goals

1. **One wizard, two clients** — Web UI and LLM tools call the same Init API.  
2. **Defaults first** — sniff + global Settings fill 80%; advanced behind
   “Customize”.  
3. **Preview before write** — dry-run shows files/DB changes; apply is one
   confirm.  
4. **No Lawpack PhD required** — humans pick presets; experts expand panels.  
5. **LLM-installable** — structured JSON schema, idempotent steps, machine
   errors; never “paste a bash script and hope”.

---

## 2. Global defaults vs project overrides

```text
Settings (global)
  └── defaults for every new Init
Project (overrides)
  └── stored on Project.meta / Init config after wizard
Assignment
  └── per-agent schedule (not Init layout)
```

| Concern | Global (Settings) | Project override (Init / project settings) |
|---------|-------------------|--------------------------------------------|
| Injection mode | default `harness_inject` | yes |
| Harness strength | default `hybrid` or `strict` | yes |
| Layout preset / paths | default vendor / `.agent` / custom template | yes |
| Lawpack pin version | “latest pin from this repo” / pinned sha | yes (freeze per project) |
| Default profile + schedule | tracking-cycle + infinite | yes (first assignment) |
| Default executor | DSH | yes |
| Gate / stack heuristics | sniff policy | edited per project |
| Git policy defaults | baseline branch `main`, RUN_ID pattern | yes |
| Protect scripts on | recommend on for `repo_plant` | yes |
| CI / hooks hints | templates off by default | opt-in |
| GateWay / DSH endpoints | global only | — |

**Rule:** Init copies globals into the project config at apply time (snapshot),
so later global changes do not silently rewrite initialized projects. Re-init /
“sync defaults” is an explicit action.

---

## 3. What belongs in Init (grouped)

Think **five cards**, not fifty fields.

### A — Project identity (usually already done at Register)

- Name, local path / gitRemote, optional monorepo workspace package  

### B — How laws arrive (Lawpack delivery)

- Mode: `harness_inject` | `repo_plant`  
- Strength: `strict` | `hybrid` (inject only)  
- Layout preset: Standard (`vendor/lawpack`) | Hidden (`.agent/lawpack`) | Custom paths  
- Lawpack pin: version/sha (from control-plane pack store)  
- Optional: which role packs to enable (default all core roles)  

### C — Stack & quality gate

- `stack_pin` (from sniff)  
- `gate` command (from sniff)  
- Optional lint/test/smoke (ADAPTER fields)  
- `hasCi` note (informational — we do **not** edit `.github/workflows` by default;
  HUMAN_OWNED)  

### D — Git & run policy

- `RUN_ID` (default from Settings `runIdPattern`)  
- Baseline branch (from Settings `baselineBranch`)  
- VCS hook installation for pack protect/assert scripts — see §5; default disabled  
- Owned-paths override path when path-protection is enabled  

### E — First agent

- Profile (tracking-cycle / fix-only / …)  
- Schedule (once / infinite / cron / manual / on_event)  
- reviewMode (`human` | `llm_propose` | `llm_auto`)  
- Optional short INITIAL objective (stub text)  

### Not in Init (later / elsewhere)

- Full role markdown editing (Agents / Lawpack editor)  
- Writing GitHub Actions YAML (human-owned; Init may only *detect* CI)  
- Starting DSH (optional last toggle “Start after Init”, default off)  
- Overview widgets / auth  

---

## 4. Wizard UX (human)

### Flow (progressive disclosure)

```text
1. Discover     auto sniff → summary chips (stack, gate, mono?, CI?)
2. Essentials   mode + strength + first profile + schedule   [Continue]
3. Review       preview file/DB diff                          [Apply]
—— Advanced (collapsed) ——
   Layout paths · RUN_ID · pin version · protect hooks · INITIAL blurb · executor
```

**Presets on step 2** (one click — UI shortcuts only; see [`settings.md`](../reference/settings.md)):

| Preset id | UI label | Meaning |
|-----------|----------|---------|
| **clean** | Clean product git | `harness_inject` + `strict` — laws via kernel only |
| **tracking** | Tracking in repo | `harness_inject` + `hybrid` — PROGRESS/BUGS in product (was informally “lab”) |
| **offline** | Offline / CI pin | `repo_plant` + Lawpack tree in product |

Default = Settings `defaultPresetId` (documented default: `tracking`).  
Presets **MUST NOT** enable git-policy enforcement or hook installation unless
those fields are set explicitly in Advanced or in Settings.

### Intuition tricks

- Plain language under each mode (“Laws stay in agent-kernel” vs “Copy laws
  into this git repo”).  
- Sniff results as editable chips, not a wall of YAML.  
- Preview list: `+ PROGRESS.md`, `+ pin abc123 in DB`, `skip vendor/`.  
- Red only for hard blockers (path missing, invalid RUN_ID).  
- Optional **“Suggest with LLM”** button fills Essentials + Advanced drafts;
  Apply still human (or `reviewMode=llm_propose` later).  

Screens: route `/projects/:id/init` as multi-step; same state machine as API.

---

## 5. Lawpack concerns vs Init configuration

Lawpack supplies **normative content** (laws, roles, optional tooling). Init
**selects and binds** policy for a project; it does not rewrite pack prose on
each apply.

| Concern | Init / Settings responsibility | Lawpack responsibility |
|---------|--------------------------------|------------------------|
| Laws | Select and record pack pin (`lawpackPin`) | Authoritative text in `LAWS.md` (or manifest entrypoint) |
| Roles | Select enabled roles / default Followup profile | Role documents under `roles/` |
| Quality gate | Persist product `gateCommand` in meta / ADAPTER | Role instructions that invoke the gate |
| CI | Detect presence (`hasCi`); do not modify workflows | Optional deny-list entries for workflow paths |
| Git policy | Snapshot operator Settings (`baselineBranch`, `runIdPattern`, feature flags). Defaults: git enforcement disabled | Optional lab-oriented branch narrative inside pack laws |
| Owned paths | Optional path to an override file when path-protection is enabled | Template deny-list (`OWNED_PATHS.md`) when the pack declares that feature |
| Tracking files | Whether to create `PROGRESS` / `BUGS` / `ADAPTER` (delivery strength / preset) | Conventions for NOW / Open sections |
| Hook scripts | Whether Init installs VCS hooks that invoke pack scripts | Optional script artifacts (`assert-run-id`, `protect-owned-paths`) |

### Hook script installation (normative)

Installation of pack-provided protect/assert scripts into the product
repository’s VCS hooks is a **configuration outcome**, not an implicit side
effect of Init.

| Condition | Requirement |
|-----------|-------------|
| `installProtectHooks === false` (default) | Init **MUST NOT** install or enable those hooks. |
| `installProtectHooks === true` | Init **MAY** install hooks, and **MUST** reference script paths from the pinned pack (or Settings overrides). |
| Pack omits protect-script feature in its manifest | Init **MUST NOT** offer or perform hook installation for that pin. |

Verification of assert/owned-path checks in the control plane follows the same
flags; see [`settings.md`](../reference/settings.md) § Git policy.

**CI:** Init **MUST NOT** synthesize CI workflow files. When `hasCi` is true, the
UI **SHOULD** inform the operator that workflows remain human-owned.

**Gate:** a single command string suitable for unattended execution, exposed in
ADAPTER and SessionBrief.

---

## 6. API for humans and LLMs (same)

### Principles

- **JSON Schema / Zod** on every body; stable field names (English).  
- **Sniff ≠ Init** — discover first, then apply.  
- **`dryRun: true`** on Init returns planned writes without touching disk/DB.  
- **Idempotent apply** where safe (skip existing stubs; fail if already
  initialized unless `forceReinit`).  
- **Error codes** + human message (`PATH_MISSING`, `ALREADY_INITIALIZED`,
  `INVALID_RUN_ID`, …).  
- **No shell strings as the API** — LLMs call tools; we execute.

### Suggested endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/api/projects` | Register |
| POST | `/api/projects/:id/sniff` | Discover meta |
| GET | `/api/settings/init-defaults` | Global defaults |
| PUT | `/api/settings/init-defaults` | Update globals |
| POST | `/api/projects/:id/init/preview` | Dry-run plan (`InitPlan`) |
| POST | `/api/projects/:id/init` | Apply (`InitRequest` → result) |
| GET | `/api/lawpack/pins` | Available pack versions |
| POST | `/api/assignments/:id/brief` | SessionBrief dry-run (already) |

### `InitRequest` shape (conceptual)

```ts
type InitRequest = {
  dryRun?: boolean
  forceReinit?: boolean
  // B — delivery
  injectionMode: 'harness_inject' | 'repo_plant'
  injectStrength?: 'strict' | 'hybrid'   // harness_inject only
  layoutPreset?: 'vendor' | 'dot-agent' | 'custom'
  layoutPaths?: Partial<LayoutPaths>
  lawpackPin?: string                   // default: current pin
  // C — stack
  stackPin?: string
  gateCommand?: string
  workspacePath?: string                // monorepo package
  // D — git policy
  runId?: string
  baselineBranch?: string               // default main
  installProtectHooks?: boolean
  createTrackingFiles?: boolean         // PROGRESS/BUGS/ADAPTER
  createAgentsMd?: boolean
  // E — first agent
  profileId?: string
  scheduleMode?: ScheduleMode
  cronExpr?: string
  reviewMode?: 'human' | 'llm_propose' | 'llm_auto'
  initialObjective?: string
  executorId?: string                   // default dsh
}
```

Omitted fields → **project override miss → global defaults → sniff → hardcoded**.

### `InitPlan` (preview)

```ts
type InitPlan = {
  writes: { path: string; action: 'create' | 'skip' | 'overwrite' }[]
  db: { projectPatch: object; assignment?: object; lawpackPin: string }
  warnings: string[]
  blockers: string[]
}
```

### LLM install pattern

1. `register` (if needed)  
2. `sniff`  
3. Optionally LLM fills `InitRequest` from sniff + user goal  
4. `init/preview` → show/plan to user or auto-approve if `reviewMode` allows  
5. `init` apply  
6. Optional `brief` dry-run  

Operator-chat tools should map 1:1 to these endpoints (same as UI buttons).

### OpenAPI

Publish `/api/openapi.json` (or static doc) so GateWay tool-calling / external
agents can import the schema. Descriptions on every field = LLM docs.

---

## 7. Minimal vs full Init (ship order)

**MVP wizard**

1. Sniff summary  
2. Preset (Clean / Lab / Offline)  
3. Profile + schedule  
4. Preview → Apply  

**Next**

- Layout custom paths  
- Protect hooks toggle  
- Lawpack pin picker  
- LLM suggest button  
- `forceReinit` / re-pin  

**Later**

- Strict DB-backed PROGRESS/BUGS  
- CI snippet generator (human paste)  
- Multi-executor picker beyond DSH  

---

## Summary

- Init configures **delivery + gate + git policy + first agent**; Lawpack *text*
  stays versioned in `lawpack/`.  
- **Globals default, project snapshots overrides** at apply.  
- Wizard = few presets + advanced drawer; preview before write.  
- LLM uses the **same InitRequest/InitPlan API** with dry-run — not a parallel
  install channel.
