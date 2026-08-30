# Games profile overlay (optional)

**Not part of the generic constitution.** Sourced from autonomous-lab /
showcase practice. Enable only when the product (or operator) wants this
overlay — e.g. game / playability loops with vision checks.

Generic laws: [`../LAWS.md`](../LAWS.md).

---

## When to use

| Use this overlay | Skip it |
|------------------|---------|
| Interactive product with a playable / visual surface | Libraries, CLIs, APIs without UI proof |
| VALIDATE/DEMO need screenshot + vision PASS | Text/gate-only ACCEPT is enough |
| “Playability” blockers in BUGS | Domain uses other blocker tags |

Control plane: bind via profile / Initial that points at this file, or plant
it beside LAWS when the operator chooses a games-oriented overlay. Do **not**
treat this file as required for every Lawpack pin.

---

## FIX-FIRST tags (games)

Prefer draining `BUGS.md` ## Open tagged `blocker` / `playability` before
FEATURE. Skip tags `human` / CI / deploy / workflows.

---

## DEMO cadence (lab default)

DEMO every **5** feature cycles when the product needs proof artifacts
([`../roles/demo.md`](../roles/demo.md)).

---

## Lie detector (lab / UI)

In addition to generic LAWS §5:

- “Playable” / “validated” without exercising the live (or pinned preview)
  surface + vision / `read_image` when UI exists
- Black/empty UI claimed PASS
- Camera or controls wrong for the stated ACCEPT (product-specific)

---

## ACCEPT examples (game-shaped)

Measurable examples — replace with product-real checks:

- Hold move key ≥1s → world position changes by a clear delta
- Screenshot → vision PASS: floor/walls visible (not black void)
- Camera: not unintended top-down; look and move share one yaw

Vibes (“feels better”, “less laggy”) remain invalid ACCEPT.

---

## Port / preview note

Some lab docs mention preview ports (e.g. avoid clashing with harness UI).
Product ADAPTER / Initial owns the real URL and port — do not hardcode lab
ports into generic LAWS.
