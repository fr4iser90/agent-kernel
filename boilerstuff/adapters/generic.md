# Adapter stub — generic

For Make, Cargo, Go, monorepos, etc.

```bash
# gate must be one entrypoint the agent can run blindly
make gate
# or: cargo test && cargo clippy -D warnings
# or: go test ./...
```

Document in ADAPTER.md:

- exact `gate` command
- how to run a 30s smoke
- whether deploy_url exists

Kernel scripts (`assert-run-id`, `protect-owned-paths`) stay shell-based and
apply regardless of language.
