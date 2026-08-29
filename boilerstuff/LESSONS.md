# Lessons from autonomous-lab (Ashen Delve)

Portable takeaways — keep the lab repo as showcase; encode improvements here.

1. **Zombie branches** — agents invent `-v2`/`-p*` per milestone. Counter:
   pinned RUN_ID + `assert-run-id.sh` + thin Followup that forbids new slugs.
2. **Playability ≠ gate green** — dual rAF + stale `updateGameVars` made the
   character walk in place while tests passed. Counter: measurable ACCEPT
   (Δposition) + validate with vision on live deploy.
3. **Protect too late** — CI-only owned-path checks. Counter: same check in
   pre-commit / local gate.
4. **Human-only CI** — agents “fixing” workflows wastes runs. Counter: hard
   stop in LAWS; one BUGS `human` line.
5. **Vite is not the kernel** — Pages + Three.js proved the loop; products
   need adapters, not a copied game tree.
6. **DSH, not Cursor** — tool surface must live in the harness (MCP/scripts)
   when leaving Cursor.

When lab discovers a new failure mode, add a bullet here and tighten roles/
scripts.
