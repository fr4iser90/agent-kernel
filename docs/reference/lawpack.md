# Lawpack — content pack contract

Lawpack is a versioned **content pack** consumed by the control plane. It is
not the control plane, not an executor, and not a substitute for Settings.

Related: [ADR-0001](../adr/0001-control-plane-vs-lawpack.md),
[ADR-0004](../adr/0004-dual-injection-multi-executor.md),
[`operating-model.md`](../explanation/operating-model.md), [`settings.md`](settings.md),
[`init.md`](../how-to/init.md). Tree: [`../lawpack/README.md`](../../lawpack/README.md).

Language: English. Normative keywords: [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Role

| Aspect | Definition |
|--------|------------|
| Purpose | Portable laws, roles, and optional tooling for product workspaces |
| Delivery | `repo_plant` and/or `harness_inject` ([ADR-0004](../adr/0004-dual-injection-multi-executor.md)) |
| Authority for *whether* git hooks or health checks run | Control-plane Settings ([`settings.md`](settings.md)) |
| Authority for *wording* of laws and roles | Pack files under the pinned version |

Default delivery preference: `harness_inject`.

---

## 2. Contract surface vs optional features

| Capability | Classification | Notes |
|------------|----------------|-------|
| Pack identity and version | Required | Pin target for the control plane |
| Laws entry document | Required | e.g. `LAWS.md` |
| Roles directory | Required | At least one role usable by profiles |
| Tracking conventions (PROGRESS/BUGS) | Recommended | Used when tracking files are enabled |
| Owned-paths template | Optional feature | Declared in manifest |
| Protect/assert shell scripts | Optional feature | Declared in manifest; installation governed by Settings |
| Adapters / prompt examples | Optional | Product- or profile-specific |

Control-plane verification and VCS hook installation for protect scripts
**MUST** follow [`settings.md`](settings.md) §2.3. Presence of script files in
a pack **MUST NOT** alone enable enforcement.

---

## 3. Current tree status (`lawpack/`)

| Artifact | Maturity | Remark |
|----------|----------|--------|
| `LAWS.md` | Usable | **Generic** constitution; overlays in `profiles/` |
| `profiles/games.md` | Optional | Game / playability ACCEPT |
| `profiles/web-compliance.md` | Optional | Docs / legal / security profile hints |
| `roles/*` | Usable | Core loop + `docs`, `legal-impressum`, `security` |
| `OWNED_PATHS.md`, `scripts/*` | Optional tooling | Settings-gated at the control plane |
| `adapters/*`, `examples/prompts/*` | Early | Extend as needed |
| Pack `MANIFEST.json` | Present | Features + entrypoints + `optionalProfiles` |

Assumptions that Init always plants a full vendor tree, or always installs
hooks, are **out of scope** for the generic contract.

---

## 4. Target layout

```text
<pack>/
  MANIFEST.json
  LAWS.md                 # generic constitution
  profiles/               # optional overlays (e.g. games.md)
  roles/
  OWNED_PATHS.md          # if feature enabled
  scripts/                # if feature enabled
  adapters/               # optional
  examples/prompts/       # optional
```

### 4.1 `MANIFEST.json` (normative shape)

```json
{
  "id": "agent-kernel-default",
  "version": "0.1.0",
  "features": ["laws", "roles", "tracking_conventions", "protect_scripts", "optional_profiles"],
  "entrypoint": {
    "laws": "LAWS.md",
    "ownedPaths": "OWNED_PATHS.md",
    "rolesDir": "roles"
  },
  "optionalProfiles": {
    "games": "profiles/games.md",
    "web-compliance": "profiles/web-compliance.md"
  },
  "optionalScripts": {
    "assertRunId": "scripts/assert-run-id.sh",
    "protectOwnedPaths": "scripts/protect-owned-paths.sh"
  }
}
```

If `protect_scripts` is absent from `features`, the control plane **MUST NOT**
offer hook installation or script-based verification for that pin.

---

## 5. Delivery rules

| Concern | Rule |
|---------|------|
| On-disk layout | From Settings `layoutPaths` / layout preset |
| Laws in product git | Determined by `injectionMode` |
| Tracking markdown in product git | Determined by tracking flags / inject strength |
| Executor binding | `SessionBrief` → `ExecutorPort`; root `AGENTS.md` when required by the adapter |

```text
Nudge
  → SessionBrief (pin, roles, paths, gate, optional owned-paths ref)
  → harness_inject: materialize or inline pack content for the session
  → repo_plant: expect content already present at configured paths
  → ExecutorPort.start(workdir = product)
```

---

## 6. Ownership boundary

| Concern | Owner |
|---------|-------|
| Pin, delivery mode, paths, git-policy flags | agent-kernel Settings / project configuration |
| Law and role text; optional script bodies | Lawpack |
| Schedule and profile binding | Assignments |
| Tool use and commits | Executor |

v1 **SHOULD** reference pack files by pin rather than duplicating role text into
the database.
