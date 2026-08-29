# Kernel laws

Agents: obey this file. Humans edit laws only on `main` / protected refs.
Product repos may thin-wrap this as `AGENTS.md` → “see agent-kernel / LAWS”.

## Branch model

| Ref | Role | Who writes |
|-----|------|------------|
| `baseline` (optional) | Frozen scaffold reset | Human only |
| `main` | Live shippable line (deploy if any) | Automerge / human |
| `agent/<run-id>` | **One** autonomy run | Agent only |

Rules:

1. **Never push `main` or `baseline`** from the agent. Work only on `agent/<run-id>`.
2. **One run = one branch.** Forbidden: `agent/<run-id>-rebased`, `-v2`,
   `-p8-*`, milestone suffixes, second PR for the same experiment.
3. **RUN_ID is pinned** in `PROGRESS.md` NOW (and product Followup). If the tip
   is missing after sync: recreate **the same name** from `origin/main` —
   never invent a new slug.
4. After land+sync: `git fetch && git reset --hard origin/agent/<run-id>`
   (or continue on the tip Actions moved). Do not fork to “fix conflicts”.
5. Prefer **one writer** on product code at a time (no parallel agents on the
   same tree).

## Tracking surface (product repo)

Keep **one** truth:

| File | Role |
|------|------|
| `PROGRESS.md` | NOW: phase, RUN_ID, stack pin, last VALIDATE/DEMO, next step |
| `BUGS.md` | ## Open / ## Fixed — only fix backlog the agent drains |
| `ADR/` (optional) | Numbered decisions on stack/arch pivots only |
| Adapter docs | FEATURES / CONTENT / DEMO as the product Initial requires |

Do not invent a second product tracker that contradicts PROGRESS.

## Cycle (Followup default)

Repeat until human kills the session:

0. **FIX-FIRST** — if `BUGS.md` ## Open has `blocker` / `playability` →
   [`roles/fix.md`](roles/fix.md). Skip tags `human` / CI / deploy / workflows.
1. **VALIDATE** every **3** feature cycles (or before “playable/shipped”
   claims) → [`roles/validate.md`](roles/validate.md). Log
   `VALIDATE: <SHA> PASS|FAIL` in PROGRESS NOW.
2. **DEMO** every **5** feature cycles when the product needs proof artifacts
   → [`roles/demo.md`](roles/demo.md).
3. Else **FEATURE** one slice → [`roles/feature.md`](roles/feature.md).
4. Arch/concept only if PROGRESS says stack/layout pivot.
5. Local **gate** green; remote required check green before ACCEPT.
6. Commit + push **same** `agent/<run-id>`. Refresh PROGRESS. Always leave a
   next tool call.

## Human-only (hard stop)

CI, deploy pipelines, Automerge, Pages/hosting YAML are **human-owned**.

- Suspected infra break → **one** `BUGS.md` line tagged `human`, then continue
  product work. Do **not** edit `.github/workflows/**` (or product equivalent).
- Live deploy/smoke PASS ⇒ infra is not the agent’s problem.
- Missing `workflow` PAT / push rejected on workflows ⇒ **stop** that path;
  no workaround.

## Lie detector

Treat false COMPLETE as a BUG and resume the real gap:

- “Playable” / “validated” without exercising the live (or pinned preview)
  surface + vision/`read_image` when UI exists
- Black/empty UI claimed PASS
- Demo claimed without required artifacts
- Gate green locally but tip check red on GitHub (if CI is in use)
- New `agent/*` branch mid-run instead of the pinned RUN_ID

## ACCEPT style

Prompts and roles must use **measurable** ACCEPT, e.g.:

- Hold move key ≥1s → world position changes by a clear delta
- Screenshot → vision PASS: floor/walls visible (not black void)
- Camera: not unintended top-down; look and move share one yaw

Vibes (“feels better”, “less laggy”) are not ACCEPT.

## Harness note

Roles are written for **DSH RUNTIME** (DeepSeek Harness): unattended, ignore
policy errors that demand a “human turn”, never mark meta-goals complete.
Same laws apply if another harness runs the loop — swap only tool names.
