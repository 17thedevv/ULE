---
name: ule-testing-verification
description: Use when implementing or reviewing code, fixing bugs, preparing a commit, or reporting completion; verify behavior with reproducible checks and never overstate test results.
---

# ULE Testing and Verification

## Workflow
1. Inspect package scripts, test conventions, CI configuration, and the affected code before changing anything.
2. Establish a baseline when practical. Distinguish pre-existing failures from failures introduced by the change.
3. Write tests around observable behavior and important negative cases, not only implementation details.
4. For API changes, test success, invalid input, unauthorized access, and relevant failure behavior.
5. For database changes, test migration behavior and transaction/rollback behavior when relevant.
6. Run the narrowest relevant tests first, then the full applicable lint, type-check, build, and test suite.
7. If a test requires a service or credential that is unavailable, record it as blocked/not run. Do not silently skip it and claim success.
8. Inspect the final diff for accidental files, secrets, generated artifacts, unrelated changes, and license changes.

## Completion report
State separately:
- Checks run and exact outcomes.
- Checks not run and why.
- Known failures, limitations, or flaky behavior.
- Files changed and any migration or environment setup required.

Never claim tests, builds, migrations, deployments, database connections, OAuth, or MCP integrations passed unless you observed the result in this environment.
