# Kernel laws (generic)

Agents: obey this file. Humans edit laws only on the product **baseline**
ref (often `main`) or other protected refs. Product repos may thin-wrap this
as `AGENTS.md` → “see Lawpack / LAWS”.

**Pack split:** This document is **product-agnostic**. Lab / game-specific
ACCEPT examples and showcase habits live in
[`profiles/games.md`](profiles/games.md) (optional overlay — not required for every
product).

**Enforcement:** Branch assert, owned-path checks, and VCS hooks are **not**
implied by this text. The control plane enables them only via Settings
(`gitPolicyEnabled`, protect flags). See agent-kernel `docs/reference/settings.md`.

---

## 1. Branch model (convention)

Narrative for agents when the operator enables git policy. Pattern names come
from Settings (`baselineBranch`, `runIdPattern`) — do not hardcode product
slugs here.

| Ref | Role | Who writes |
|-----|------|------------|
| Baseline (e.g. `main`) | Live / shippable line | Human / automerge |
| Optional frozen baseline | Scaffold reset | Human only |
| Run branch (`runIdPattern`) | **One** autonomy run | Agent only |

Rules:

1. **Never push the baseline** from the agent. Work only on the pinned run branch.
2. **One run = one branch.** Do not invent suffix forks (`-v2`, `-rebased`, …)
   when Settings forbid them.
3. **RUN_ID is pinned** in tracking (e.g. `PROGRESS.md` NOW) and the SessionBrief.
   If the tip is missing after sync: recreate **the same** name from the
   baseline — never invent a new slug mid-run.
4. After land+sync: reset hard to the remote tip of **that same** run branch.
   Do not fork to “fix conflicts”.
5. Prefer **one writer** on the product tree at a time.

---

## 2. Tracking surface (when enabled)

When Settings / Init create tracking files, keep **one** truth:

| File | Role |
|------|------|
| `PROGRESS.md` | NOW: phase, RUN_ID, stack pin, last VALIDATE, next step |
| `BUGS.md` | ## Open / ## Fixed — backlog the agent drains |
| `ADR/` (optional) | Numbered decisions on stack/arch pivots only |
| Adapter docs | Stack / gate / demo notes as the product Initial requires |

Do not invent a second product tracker that contradicts PROGRESS.

Under `harness_inject` + **strict**, tracking MAY live only in the control
plane — then update via the tools the Brief provides, not by inventing files.

---

## 3. Cycle (Followup default)

Repeat until the human stops the session:

0. **FIX-FIRST** — if `BUGS.md` ## Open has `blocker` (or product-equivalent)
   → [`roles/fix.md`](roles/fix.md). Skip tags marked `human` / CI / deploy /
   workflows.
1. **VALIDATE** on the cadence the profile requires (default: every **3**
   feature cycles, or before “shipped/done” claims) →
   [`roles/validate.md`](roles/validate.md). Log `VALIDATE: <SHA> PASS|FAIL`
   in PROGRESS NOW.
2. **DEMO** when the product profile requires proof artifacts →
   [`roles/demo.md`](roles/demo.md).
3. Else **FEATURE** one slice → [`roles/feature.md`](roles/feature.md).
4. Arch/concept only if PROGRESS says stack/layout pivot →
   [`roles/arch.md`](roles/arch.md).
5. Local **gate** green; remote required checks green **if the product uses CI**
   before ACCEPT.
6. Commit + push **same** run branch. Refresh PROGRESS. Always leave a next
   tool call.

---

## 4. Human-only (hard stop)

CI, deploy pipelines, automerge, and hosting YAML are **human-owned** when
present.

- Suspected infra break → **one** `BUGS.md` line tagged `human`, then continue
  product work. Do **not** edit `.github/workflows/**` (or product equivalent).
- Missing credentials / push rejected on workflows ⇒ **stop** that path; no
  workaround.
- Products **without** CI: ignore remote-check rules; local gate still applies.

---

## 5. Lie detector (generic)

Treat false COMPLETE as a BUG and resume the real gap:

- “Done” / “validated” without exercising the ACCEPT surface the role requires
- Gate green locally but required remote check red **when CI is in use**
- New run branch mid-run instead of the pinned RUN_ID
- Demo claimed without required artifacts (when DEMO is in the profile)

Product-specific ACCEPT examples (games, vision, etc.): see
[`profiles/games.md`](profiles/games.md) if that overlay is enabled.

---

## 6. ACCEPT style

Prompts and roles must use **measurable** ACCEPT (observable outcome, not
vibes). “Feels better” / “less laggy” are not ACCEPT.

Define ACCEPT in the role, Initial, or product profile — not as vague prose.

---

## 7. Harness note

Roles assume an **unattended coding harness** (DSH v1; other `ExecutorPort`
adapters later): ignore policy errors that demand a “human turn”, never mark
meta-goals complete. Same laws if another harness runs the loop — swap only
tool names via the adapter / Brief.
