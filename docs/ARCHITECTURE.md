# Runtime architecture

## Coordination

Retrieval runs one asynchronous query per selected market, with at most two concurrent queries. Each returns up to eight source references. The runtime checks the returned references against the current corpus and commits canonical source records. Analysis consumes those records and compares the structured position for each market. Conflicting or missing positions become explicit blockers. Review receives the findings and blockers, then either opens the approval gate or blocks publication.

A version is attached to every in-flight step. Each checkpoint compares the run ID, requirements version, and expected stage before it can advance execution. Pausing blocks checkpoint commits. A requirement edit increments the version and clears downstream findings and approval. An evidence edit invalidates the same downstream data when the active set of references changes. Cancellation before commitment prevents later steps from publishing. Cancellation after a receipt is committed cannot reverse that local effect.

## Persistence and recovery

Browser IndexedDB is the authority for the selected run, checkpoints, events, approval scopes, the evidence catalog, preferences, and receipts. Each command reads the latest state and writes its successor in a single read-write transaction. Concurrent tabs serialize writes through IndexedDB, use stage or version guards for stale commands, and share committed updates through BroadcastChannel.

Only publication creates a simulated side effect. Approval is bound to the run, requirements version, publication action, and evidence versions. The receipt uses that same scope as its identity. A fault can save the receipt while leaving the run at publication. Restart first checks for that receipt and marks the run complete without writing another. This guarantee applies within the browser origin and profile while its storage persists.

The runner permits one active run. Review allows one retry after an injected failure or timeout. Timeout injection writes the deadline before the next check. Retrieval, analysis and publication are bounded local work. No external tool runs during any stage. A completed or cancelled run remains available in history until the rolling history reaches 15 runs. The log retains up to 60 events per run.

## Evidence, memory and tools

Retrieval filters by project, market, topic and demo access, then uses the latest eligible document version after considering withdrawals. Withdrawal creates a tombstone at a higher version, so the older version cannot reappear. Restoration creates another version. Historical runs retain what they cited at the time. The catalog is capped at 80 versions.

Source prose is rendered as text. Conclusions use the fixed, synthetic evidence metadata and expose source IDs and versions. Canvas imports use the starter schema and size limits, and never populate evidence, approvals or runtime checkpoints. Only the bundled reference image can be rendered. All operations use the fixed command set. The local server serves a fixed route table, checks the Host header and binds to loopback. Events contain stage summaries and version numbers, with no private model traces or credentials.

The single saved language preference defaults new runs. It can be updated or forgotten independently of the evidence catalog. Canvas and theme preferences use separate browser storage.

## Limitations

The demonstration runs while a browser tab is open, and resumes from its last checkpoint when the same origin is reopened. Browser data clearing or an origin change loses access to stored runs. The demo access filter illustrates scoping in a single-user application. Authentication, encryption, background workers, semantic ranking, live models, and external side effects are outside this scope. The canvas uses an editable card grid with explicit links, and preserves imported positions in exported snapshots.
