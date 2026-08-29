# Adapters

An **adapter** tells the kernel how *this* product builds, tests, and proves
itself. Kernel laws stay the same; only commands and URLs change.

Copy [`_template.md`](_template.md) to the product as `ADAPTER.md` (or keep
under `adapters/<name>.md` and link from PROGRESS).

| Stub | Intent |
|------|--------|
| [`_template.md`](_template.md) | Fill-in for any stack |
| [`web.md`](web.md) | SPA / static web (Vite, Next, …) |
| [`python.md`](python.md) | Python service / CLI |
| [`generic.md`](generic.md) | Make/Bazel/Cargo catch-all |

Agents read ADAPTER.md for: `gate` command, smoke, deploy URL, preview port.
They must not invent a second stack.
