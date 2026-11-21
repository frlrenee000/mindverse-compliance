# Mindverse Compliance Research

HKGAI Challenge 01 · A local, recoverable multi-agent runtime for researching fictional compliance documents. The example uses Hong Kong and Singapore labels for market scope. All policy excerpts are synthetic.

## Run locally

Requires Node.js 22.18+ and a modern browser with IndexedDB and BroadcastChannel. No API key or external service is needed.

```sh
npm ci --offline
npm test
npm run build
npm run dev
```

Open http://localhost:3061. The built-in Node commands also work without npm: `node scripts/serve.mjs`, `node --test tests/*.test.ts`, and `node scripts/build.mjs`. To change the port, copy `.env.example` to `.env` and edit `PORT`.

## Try the workflow

1. **Surface a conflict.** Start the default **Hong Kong and Singapore / Customer onboarding** run. The two market searches run concurrently. Analysis hands the contradictory Singapore sources to Review, which blocks publication.
2. **Change requirements and approve.** Set Market to **Hong Kong** and click **Apply scope change**. The new version retrieves fresh evidence. Click **Approve local publication** at the review gate. To see approval invalidation in action, change Topic after approval is requested, or withdraw **HK-A** in **Evidence library**. A new approval is required after relevant evidence changes. Restore a withdrawn source to continue.
3. **Recover an interrupted step.** End the current run and start a Hong Kong run with **Review fails once**. When blocked, refresh and click **Retry review**. The log shows one retrieval, one analysis, and two review attempts. **Review times out** exercises the saved deadline and the same bounded retry.
4. **Recover an uncertain publication.** Start a Hong Kong run with **Interruption after publication** enabled. Approve it. When the screen shows **Recovery pending**, refresh or click **Recover publication**. The log reconciles the existing receipt and the interface still shows **One local publication**.
5. **Reuse a preference.** Set Output language to **中文**. In **Long-term memory**, click **Remember output language**. Refresh or start a new run to use the saved default. Saving a new language replaces the preference. **Forget** removes it. Pausing and cancelling are available before publication is committed.

The expandable **Research canvas** retains version-1 snapshot compatibility and supports editing notes, adding or removing links, saving locally, and importing or exporting JSON. Run history and canvas saves are independent.

## Submission notes

- [Architecture and design tradeoffs](docs/ARCHITECTURE.md)
- [Verification results](docs/TEST-RESULTS.md)
- The runtime uses deterministic agents and typed scope filters against a bundled corpus. Simulated publication writes one browser-local receipt. There are no live models, production services, third-party runtime dependencies, or outbound requests.
- Starter attribution: [Azzz368/test1](https://github.com/Azzz368/test1), Challenge 01. This submission reuses its canvas schema, snapshot validator, baseline mock, tests, and reference assets. The workspace uses browser-native controls in place of the starter's Next.js/React Flow interface. The starter theme guides remain in `docs/`.
- Codex assisted with implementation, tests, and documentation. The initial implementation and verification took approximately 10 minutes in the working session. This excludes prior project selection and any subsequent review.
