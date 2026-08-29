# Adapter stub — python

Example pin: `python-3.12 + uv + pytest + ruff`

Suggested gate shape:

```bash
uv run ruff check .
uv run pytest
# optional: mypy / ty
```

Validate: HTTP smoke (`curl`/httpx) against preview or staging; CLI
`--help` / golden output for CLI products.

Deploy URL may be “none” for libraries — then validate = tests + import smoke.
