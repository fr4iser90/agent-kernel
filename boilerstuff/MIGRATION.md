# Migration — attach kernel to a product

`autonomous-lab` stays as-is. Products adopt **this** kernel gradually.

## Do / don’t

| Do | Don’t |
|----|-------|
| Vendor or submodule `roles/`, `LAWS.md`, scripts | Copy the Vite/Three.js game tree |
| Add thin `AGENTS.md` pointing at laws | Fork a new `agent/*` slug every milestone |
| Define one adapter `gate` | Assume Pages + pnpm everywhere |
| Pin RUN_ID in PROGRESS on day 1 | Edit workflows to “fix” autonomy |

## Steps (one product)

1. **Choose RUN_ID** — e.g. `agent/myapp-20260829`. Write it in `PROGRESS.md` NOW.
2. **Drop kernel files** — either:
   - `git submodule add … agent-kernel` → `vendor/agent-kernel`, or
   - copy `LAWS.md`, `OWNED_PATHS.md`, `roles/*.md`, `scripts/*.sh` and note
     the kernel SHA in PROGRESS.
3. **Root `AGENTS.md`** (short):

   ```markdown
   # Agent law
   Obey vendor/agent-kernel/LAWS.md and roles/.
   RUN_ID: agent/myapp-20260829 — never invent a second agent branch.
   Gate: ./scripts/gate.sh (or npm/pnpm/cargo/make target).
   ```

4. **Adapter** — copy `adapters/_template.md` → `ADAPTER.md`; fill gate command,
   smoke, deploy URL (if any), stack pin.
5. **Hooks** — pre-commit:
   - `scripts/assert-run-id.sh agent/myapp-20260829`
   - `scripts/protect-owned-paths.sh`
   - fast unit/lint
6. **BUGS.md / PROGRESS.md** — create empty Open / NOW if missing.
7. **First Followup** — paste `examples/prompts/followup.template.md` with
   RUN_ID and Initial path filled.
8. **Prove** — one FIX or FEATURE cycle on the pinned branch; confirm no zombie
   branches; local protect fails if you touch `.github/workflows`.

## Order across your portfolio

1. Spec this kernel (done in-repo).
2. Attach to **one** small non-lab product; harden scripts.
3. Then roll out to other repos.
4. Only later: optional LSP MCP, richer validate for each UI stack.

## Relationship to autonomous-lab

- Lab = **experiment + proof** that the loop works end-to-end (incl. Pages).
- Kernel = **portable law**.
- When lab invents a better role rule, **port the idea here**; do not merge lab
  `src/` into products.
