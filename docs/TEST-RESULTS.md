# Verification results

Node.js v24.22.1. The project targets Node.js 22.18 or later.

| Check | Result |
|---|---|
| `node --test tests/*.test.ts` | 19 passed, 0 failed |
| `node scripts/build.mjs` | Passed |
| JavaScript syntax checks | Passed for browser modules and Node scripts |
| Fresh archive verification | Re-extracted the archive, reran all 19 tests and rebuilt successfully |
| Browser walkthrough | Pending. The execution environment blocked the loopback server with EPERM and the browser session timed out |
| `npm ci --offline` | Pending. npm was unavailable in the execution environment. The package and lockfile declare zero dependencies |

Seven starter checks cover snapshot compatibility and mock behavior. Twelve runtime checks cover parallel retrieval, role handoffs, conflicting evidence, scoped approval, version changes, source withdrawal, stale or forged retrieval, restricted documents and hostile text, review failure, saved deadlines, cancellation, receipt reconciliation, and persistent preferences. Tests model restoration by serializing and reloading state. The browser walkthrough is needed to verify the actual IndexedDB wiring.
