# Operator chat — normative tool list

**Diátaxis:** reference. UI scopes: [`../explanation/ui.md`](../explanation/ui.md).
Actors: [`../explanation/actors.md`](../explanation/actors.md).
HTTP: [`schemas/openapi.yaml`](schemas/openapi.yaml).

Operator LLM tools **MUST** map 1:1 onto control-plane APIs (same as buttons).
No side channel. Coding tools (edit file, shell in product) belong to the
**executor**, not this list.

---

## Tools (v1 contract)

| Tool name | Scope | Maps to | Notes |
|-----------|-------|---------|-------|
| `list_projects` | overview | `GET /api/projects` | |
| `get_project` | project | `GET /api/projects/{id}` | |
| `register_project` | overview | `POST /api/projects` | path or gitRemote |
| `sniff_project` | project | `POST /api/projects/{id}/sniff` | |
| `get_settings` | overview | `GET /api/settings` | |
| `update_settings` | overview | `PUT /api/settings` | respect reviewMode |
| `init_preview` | project | `POST /api/projects/{id}/init/preview` | required before apply when LLM-driven |
| `init_apply` | project | `POST /api/projects/{id}/init` | human or reviewMode |
| `list_profiles` | overview | `GET /api/profiles` | |
| `list_assignments` | project / orchestrator | `GET /api/projects/{id}/assignments` or global | |
| `preview_fanout_targets` | orchestrator | `GET /api/assignments/{id}/targets` | global only |
| `create_assignment` | project / global | `POST …/assignments` | include `fanOut` when global |
| `update_assignment` | project | `PATCH …/assignments/{id}` | pause/schedule |
| `brief_preview` | project | `POST /api/assignments/{id}/brief` | dry-run SessionBrief |
| `nudge_run` | project / orchestrator | `POST /api/assignments/{id}/nudge` | creates Run |
| `list_runs` | project / overview | `GET /api/runs` | filter by project |
| `get_run` | project | `GET /api/runs/{id}` | |
| `get_attention` | overview | `GET /api/observability/attention` | |
| `analyze_project` | project | `POST /api/projects/{id}/analyze` | facts refresh |

---

## Explicitly forbidden as operator tools

| Capability | Why |
|------------|-----|
| Edit product source / PROGRESS as file tools | Coding agent / executor |
| Call DSH Host bypassing API start policy | Policy before tokens |
| Read raw secrets | Only secret **refs** |
| Patch `.github/workflows` | Human-owned (LAWS) |

---

## reviewMode

| Mode | Tool behaviour |
|------|----------------|
| `human` | Mutating tools return proposal / require UI confirm |
| `llm_propose` | Draft + wait for operator accept |
| `llm_auto` | May apply; still audit every mutation |

Default for Init/Settings mutations: **`human`**.
