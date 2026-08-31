# Settings — global configuration

Operator-scoped defaults for new projects. Per-project values are snapshotted
at Init apply and remain stable until an explicit re-init or “sync defaults”
action.

**Normative keywords** in this document follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
(`MUST`, `MUST NOT`, `SHOULD`, `MAY`).

Related: [`../explanation/operating-model.md`](../explanation/operating-model.md),
[`../how-to/init.md`](../how-to/init.md),
[`lawpack.md`](lawpack.md), [`../explanation/ui.md`](../explanation/ui.md),
machine contracts: [`schemas/readme.md`](schemas/readme.md).

Language: English.

---

## 1. Configuration layers

```text
Settings (global)
    │  snapshot at Init apply
    ▼
Project configuration (meta / InitConfig)
    │
    ▼
Assignment (schedule, runId, reviewMode)
```

Unresolved Init fields resolve in this order:

1. Explicit `InitRequest` field  
2. Existing project override  
3. Global Settings  
4. Sniff-derived hint (stack / gate only)  
5. Documented fallback in this file  

Implementations **MUST NOT** introduce undocumented fallbacks in application
modules.

---

## 2. Setting groups

### 2.1 Runtime

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `executorId` | string | `dsh` | Active `ExecutorPort` adapter identifier |
| `dshInvokeMode` | `cli` \| `host_http` | `host_http` | Unused for BYO outbound WSS (kept null/unused in product path) |
| `dshEndpoint` | URL \| null | `null` | Unused for BYO outbound WSS |
| `githubDefaultLogin` | string \| null | `null` | Optional default GitHub login hint for UI |
| `githubSignupMode` | `closed` \| `open` \| `allowlist` | `closed` | Whether GitHub may create new accounts |
| `githubSignupAllowlist` | string[] | `[]` | Required when mode is allowlist |
| `authRequiredForApi` | boolean | `true` | Catalog/runs/executor APIs require a session |
| `gatewayUrl` | URL \| null | `null` | Global gateway (prefer per-user My Executor) |
| `gatewayApiKeyRef` | secret reference \| null | `null` | Credential reference; **MUST NOT** appear in Lawpack |

Project workdirs are **not** Settings — per-project `localPath` is an opaque **executor** path in the catalog.

Per-user **My Executor** also stores `detectRoots` (string[]): absolute parent folders on the paired device. Detect lists direct git children over WSS; the kernel never reads that filesystem. Optional device env `AGENT_KERNEL_DETECT_ROOTS` is merged on the device.

### 2.2 Law delivery defaults

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `injectionMode` | `harness_inject` \| `repo_plant` | `harness_inject` | Preferred law delivery mode |
| `injectStrength` | `strict` \| `hybrid` | `hybrid` | Applicable when `injectionMode` is `harness_inject` |
| `layoutPreset` | `vendor` \| `dot-agent` \| `custom` | `dot-agent` | Layout template; paths remain overridable |
| `layoutPaths` | object | see Init | Relative paths for lawpack, AGENTS, tracking files |
| `lawpackPinPolicy` | `latest` \| pin id | `latest` | Pack resolution policy |
| `createTrackingFiles` | boolean | `true` | Create PROGRESS / BUGS / ADAPTER when applicable |
| `createAgentsMd` | boolean | `true` | Create root AGENTS when the executor benefits from it |

### 2.3 Git policy

Git enforcement is **operator configuration**. Pack documents may describe a
branch model for agents; the control plane **MUST NOT** treat pack prose as
enabled policy until the flags below allow it.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `gitPolicyEnabled` | boolean | `false` | Master switch for control-plane git enforcement |
| `baselineBranch` | string | `main` | Human baseline ref name |
| `runIdPattern` | string | `agent/<slug>-YYYYMMDD` | Template used to validate and suggest RUN_IDs |
| `forbidRunIdForkSuffixes` | string[] | `["-v2","-p","-rebased"]` | Empty array disables suffix rules |
| `protectAssertRunId` | boolean | `false` | Enable RUN_ID / branch assertion checks |
| `protectOwnedPaths` | boolean | `false` | Enable owned-path checks |
| `installProtectHooks` | boolean | `false` | Permit Init to install VCS hooks that invoke pack scripts |
| `ownedPathsFile` | path \| null | `null` | Optional product override for the deny-list file |

#### Normative behaviour

| Situation | Requirement |
|-----------|-------------|
| `gitPolicyEnabled` is `false` | Control plane **MUST NOT** execute assert/owned-path verification as health, and **MUST NOT** surface those failures as Overview attention. |
| `installProtectHooks` is `false` | Init **MUST NOT** install VCS hooks for pack scripts. |
| `installProtectHooks` is `true` and pack declares protect scripts | Init **MAY** install hooks; paths **MUST** resolve from the pinned pack (or explicit overrides). |
| Pack manifest omits protect-script feature | Init **MUST NOT** install hooks for that pin, regardless of the flag. |

### 2.4 Init and first-agent defaults

| Key | Type | Default |
|-----|------|---------|
| `defaultPresetId` | `clean` \| `tracking` \| `offline` | `tracking` |
| `defaultProfileId` | string | `tracking-cycle` |
| `defaultScheduleMode` | ScheduleMode | `infinite` |
| `defaultReviewMode` | `human` \| `llm_propose` \| `llm_auto` | `human` |
| `defaultCronExpr` | string \| null | `0 3 * * *` |

### 2.5 Observability

| Key | Type | Default |
|-----|------|---------|
| `widgetLayout` | JSON | product default |
| `attentionRules` | JSON | product default |

### 2.6 Multi-user (M6)

Authentication, ACL, and audit — see ADR-0003.

---

## 3. Init presets

Presets are **UI/API convenience profiles** that populate Settings-shaped fields.
They are not Lawpack package identifiers.

| Identifier | Label | Effect |
|------------|-------|--------|
| `clean` | Clean product git | `harness_inject` + `strict`; tracking files not required in git |
| `tracking` | Tracking in repository | `harness_inject` + `hybrid`; create tracking files (and typically AGENTS) |
| `offline` | Offline / CI pin | `repo_plant` with layout-appropriate Lawpack tree |

Presets **MUST NOT** set `gitPolicyEnabled`, `installProtectHooks`, or protect
verification flags unless the operator (or an explicit Advanced field) sets them.
The `offline` preset **MAY** recommend enabling hooks in the UI; confirmation
remains required.

---

## 4. HTTP API (specification)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Return the settings document |
| `PUT` | `/api/settings` | Replace or merge globals |
| `GET` | `/api/settings/init-defaults` | Subset used by Init (groups 2.2–2.4) |
| `PUT` | `/api/settings/init-defaults` | Update that subset |

Persistence: versioned document in the control-plane DB (SQLite local /
Postgres server — [ADR-0005](../adr/0005-persistence-sqlite-postgres.md)). A
`schemaVersion` field **MUST** be present.

---

## 5. Implementation constraints

| Constraint | Requirement |
|------------|-------------|
| RUN_ID validation | **MUST** derive from `runIdPattern` (and related Settings), not from ad hoc literals |
| Baseline / main allowances | **MUST** follow `baselineBranch` and git-policy flags |
| Health verification via pack scripts | **MUST** require `gitPolicyEnabled` and the relevant protect flags |
| Layout paths | **MUST** come from Settings / project configuration |
| Executor selection | **MUST** use `executorId` |

Conflict with this document is a specification defect in the implementation.
