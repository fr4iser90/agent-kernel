# Adapter template

Copy to product root as `ADAPTER.md` and fill every `{{…}}`.

```yaml
name: {{product-slug}}
stack_pin: {{e.g. python-3.12 + fastapi}}  # immutable mid-run without ADR
run_id: agent/{{slug}}-{{YYYYMMDD}}

gate: {{e.g. pnpm run gate | make gate | uv run pytest && ruff check}}
lint: {{optional fast}}
test_unit: {{optional}}
test_smoke: {{optional playwright / curl script}}

preview: {{local URL or command}}
deploy_url: {{production/staging URL or "none"}}
deploy_lag_minutes: {{5}}  # wait after land before validate-stale

owned_paths: OWNED_PATHS.md   # or path to product override
progress: PROGRESS.md
bugs: BUGS.md
```

## ACCEPT hints (product-specific)

List measurable checks the validate/feature roles must obey, e.g.:

- API: `GET /health` → 200
- UI: boot screenshot not blank; primary CTA works
- Move/camera/lighting: only if this product has them

## Forbidden mid-run

- Switching `stack_pin` without Arch + ADR
- Touching HUMAN_OWNED paths listed in OWNED_PATHS
