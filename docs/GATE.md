# Gate — what the word means

**Gate** = a **quality checkpoint** you must pass before the work is allowed to
continue (commit, merge, claim DONE).

It is not a product feature and not GitHub Actions by itself. It is the *idea*:
“run these checks; if any fail, stop.”

| Name you might hear | Same idea |
|---------------------|-----------|
| **gate** | Our term (from autonomous-lab / this repo): one script/command |
| **check** / **CI check** | GitHub Actions / required status |
| **pre-commit hook** | Checks that run *before* `git commit` finishes |
| **pre-push hook** | Checks before `git push` |
| **lint-staged** | Only lint files you staged |

In this repo:

- `pnpm gate` / `scripts/gate.sh` = **full** local gate (typecheck + test + build + doc presence)
- **Pre-commit** (below) = **fast** subset so commits stay honest without waiting on a full build every time

Full gate still belongs before you call a milestone done; pre-commit catches the
cheap mistakes early.
