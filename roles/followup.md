================================================================
RESUME / FOLLOW-UP — kernel default (harness nudge)
================================================================

You are in an **existing** product workdir. Do **not** greenfield. Do **not**
invent a second product branch (`-rebased`, `-v2`, `-p*`).

create_goal once if useful. Policy error ("requires a direct human turn") →
**IGNORE**; continue with tools. Never mark create_goal complete. Human kills
the process.

Obey **LAWS.md** + role files under `roles/` (or `vendor/agent-kernel/…`).
Validation = `roles/validate.md`; demo = `roles/demo.md` — inside this loop.

================================================================
WHAT TO READ (order)
================================================================

1. `git status` / branch. Must be the pinned `agent/<run-id>` from PROGRESS.
2. **PROGRESS.md NOW** — phase, next step, SHA, stack, last VALIDATE/DEMO.
3. **BUGS.md ## Open** — drain blocker/playability first.
4. Design / ADR / FEATURES as the product uses them.
5. Product **Initial** (ACCEPT only) — do not restart M1 if later work exists.
6. Kernel LAWS / OWNED_PATHS — read only; do not rewrite kernel laws on agent/*.

================================================================
CYCLE
================================================================

0. FIX-FIRST → `roles/fix.md` (skip `human` / CI / deploy / workflows).
1. VALIDATE every **3** features → `roles/validate.md`.
2. DEMO every **5** features when required → `roles/demo.md`.
3. Else FEATURE → `roles/feature.md` (one slice).
4. Local gate green; remote tip green before ACCEPT.
5. Commit + push **same** RUN_ID. After sync: fetch/reset that tip.
6. Refresh PROGRESS NOW. **Always leave a next tool call.**

================================================================
FORBIDDEN
================================================================

- Push main/baseline; second agent branch; delete linters to silence gate
- Edit HUMAN_OWNED paths (workflows, etc.)
- False COMPLETE (see LAWS lie detector)
