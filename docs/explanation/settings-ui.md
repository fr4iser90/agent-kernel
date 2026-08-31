# Settings page (`/settings`) — UI ↔ schema

**Diátaxis:** explanation (IA). Canonical keys:
[`../reference/settings.md`](../reference/settings.md) +
[`../reference/schemas/settings.schema.json`](../reference/schemas/settings.schema.json).
First-boot flow: [`../tutorials/getting-started.md`](../tutorials/getting-started.md) §4.
Route lives in [`ui.md`](ui.md).

This page **MUST** expose every Settings group 1:1. No silent extra fields.
No env-only GateWay/DSH as the operator SoT after first save.

---

## Entry

| Situation | Behavior |
|-----------|----------|
| Required Settings missing after Login | Redirect / block into **setup wizard** (same field groups, stepped) |
| Later edits | `/settings` full page; Save → `PUT /api/settings` |
| Init defaults only | MAY offer tab “Init defaults” → `PUT /api/settings/init-defaults` |

---

## Layout (one page, sections = schema groups)

```text
┌─────────────────────────────────────────────────────────┐
│  Settings                                    [Save]     │
├─────────────────────────────────────────────────────────┤
│  1. Workspace & runtime                                 │
│  2. Law delivery defaults                               │
│  3. Git policy                                          │
│  4. Init & first-agent defaults                         │
│  5. Observability                                       │
│  6. Multi-user (M6) — stub / link                       │
└─────────────────────────────────────────────────────────┘
```

### 1 — Workspace & runtime ↔ §2.1

| UI control | Settings key |
|------------|--------------|
| Default executor select | `executorId` (`dsh`, later `claude-code`, `pi`) |
| GateWay URL (when operatorLlm=gateway) | per-user My Executor `gatewayUrl` |
| GateWay API key | per-user (masked) |

Product workdirs are registered per project as **executor path** — not a global Settings root.

### 2 — Law delivery defaults ↔ §2.2

| UI control | Settings key |
|------------|--------------|
| Injection mode | `injectionMode` |
| Inject strength | `injectStrength` (when harness_inject) |
| Layout preset | `layoutPreset` |
| Advanced path map | `layoutPaths` |
| Lawpack pin policy | `lawpackPinPolicy` |
| Create tracking files | `createTrackingFiles` |
| Create AGENTS.md | `createAgentsMd` |

### 3 — Git policy ↔ §2.3

| UI control | Settings key | Notes |
|------------|--------------|-------|
| Enable git policy | `gitPolicyEnabled` | Default **off** |
| Baseline branch | `baselineBranch` | |
| RUN_ID pattern | `runIdPattern` | |
| Forbidden suffixes | `forbidRunIdForkSuffixes` | |
| Assert RUN_ID | `protectAssertRunId` | Disabled unless master on |
| Protect owned paths | `protectOwnedPaths` | Disabled unless master on |
| Install protect hooks | `installProtectHooks` | Default **off** |
| Owned-paths override | `ownedPathsFile` | |

UI **MUST** show that pack prose alone does not enable enforcement.

### 4 — Init & first-agent defaults ↔ §2.4

| UI control | Settings key |
|------------|--------------|
| Default preset | `defaultPresetId` (`clean` \| `tracking` \| `offline`) |
| Default profile | `defaultProfileId` (e.g. `tracking-cycle`) |
| Default schedule | `defaultScheduleMode` |
| Default review mode | `defaultReviewMode` |
| Default cron | `defaultCronExpr` |

Presets **MUST NOT** flip git-policy / hook flags unless the operator sets
those controls explicitly.

### 5 — Observability ↔ §2.5

| UI control | Settings key |
|------------|--------------|
| Widget layout editor (M3) | `widgetLayout` |
| Attention rules | `attentionRules` |

### 6 — Multi-user ↔ §2.6 / ADR-0003

v1: show “single operator / local-owner”; no teams UI until M6.

---

## Save contract

1. Load: `GET /api/settings` (requires `schemaVersion`).  
2. Save: `PUT /api/settings` with full or merge document.  
3. Validation: reject unknown keys; align with JSON Schema.  
4. After save: setup wizard complete flag; allow Overview.

**Out of Settings UI:** Compose publish ports, Traefik labels, image build args
(`VITE_API_BASE`) — deploy/infra only.
