# Acceptance review — 2026-11-05

Decision: **do not release the WuzAPI pilot**. The integration and staging gate remain incomplete. This report distinguishes observed failures from unavailable evidence; skipped scenarios are not passes.

## Execution

- Full repository suite: **FAIL** — 85 files and 603 tests passed; `src/instrumentation.test.ts` fails because it expects `startWahaEventConsumer` while current instrumentation contains no consumer. No product files were changed during this review.
- WhatsApp domain suite: **PASS** — 26 files, 218 tests; these are unit tests, not phone or staging validation.
- TypeScript: **PASS** — `tsc --noEmit --incremental false`, including the acceptance test files.
- Juspilot published-contract checks: **FAIL**, 2/2. The adapter uses `Authorization` where [the published specification](https://wuzapi.juspilot.com/api/spec.yml) declares the `token` header, and sends `{webhookURL}` where the specification requires `{webhook, events}`. Synthetic responses exercise generated requests; installed-version behavior and captured anonymized real events remain unverified. Existing synthetic normalizer/adapter tests passed within the domain suite, but are not recorded-event tests.
- Staging acceptance: **BLOCKED**, 15/15 skipped. No staging driver, isolated test database, provider account, two authenticated browser sessions or online phone was provided. The tests specify observable assertions; implementing and connecting a real driver is still required. No simulated result was counted as acceptance evidence.
- Latency collector self-tests: **PASS**, 3/3. Application instrumentation, real latency measurements and sampling are still missing. No production or staging traffic was generated.
- Database migration/rollback: **BLOCKED**. Migrations were not applied to an isolated database copy; account switch, pending-send reconciliation, rollback, preserved IDs/history and actual callback verification were not exercised.

## Checklist (SPEC section 8)

| Item | Status | Evidence and remaining work |
| --- | --- | --- |
| ADR and existing-account migration | BLOCKED | ADR-007 and ADR-006 amendment exist; migration has not been applied and validated on a copy. |
| WuzAPI connect, QR, status, reconnect | FAIL / BLOCKED | Published request-contract checks fail; panel and real session/QR/reconnection are not proven. |
| Public environment-derived webhook registered and verified | FAIL / BLOCKED | Registration request differs from published spec; WuzAPI webhook authentication/processing and external callback are not validated. |
| Text, audio, media and quoted reply end to end | BLOCKED | No device/phone or browser execution; audio route and composer/inbound flow are not integrated according to t6. |
| SSE resumes and authorized sessions converge | FAIL / BLOCKED | t4 reports no durable cursor or replay; live two-session recovery and proxy behavior untested. |
| Public API, templates, automations and AI use account provider | FAIL / BLOCKED | t3 reports existing paths are not unified and WuzAPI processing is absent; no live history validation. |
| Idempotency, receipt ordering and restart recovery | FAIL / BLOCKED | Domain monotonic merge unit tests pass, but durable event ledger, early receipt buffer and restart recovery are absent per t3; no real fault injection. |
| Permissions and cross-organization isolation | BLOCKED | Viewer send and account isolation have focused mock coverage, not full flows and media authorization; t6 reports the old public upload/delete path requires separate review. |
| History, contacts, assignment and counters after migration | BLOCKED | No provider migration, account switch or comparison against a database copy. |
| Latency, rollback and runbook | BLOCKED | Runbook exists; collector is not instrumented and rollback has not been rehearsed. No observed percentiles. |

## Latency

| Metric | p50 | p95 | Failure rate | Initial target |
| --- | --- | --- | --- | --- |
| Click → local bubble | N/A | N/A | N/A | p95 ≤ 100 ms |
| Text send → provider accept | N/A | N/A | N/A | p95 ≤ 2 s |
| Text webhook → second screen | N/A | N/A | N/A | p95 ≤ 500 ms |
| Provider accept → phone receipt | N/A | N/A | N/A | No target specified |
| Audio upload, conversion, clip duration | N/A | N/A | N/A | Establish by clip duration and network after measurement |

N/A means zero real observations, not zero latency or zero failures. Sampling must cover at least 100 texts and 30 audio clips per duration in different periods; compare equivalent conditions. Report missing outcomes and synchronized-clock uncertainty separately.

## Remaining bottlenecks and blockers

1. Reconcile and test the installed WuzAPI contract and authentication; obtain anonymized recorded success, failure, webhook and receipt events. Never infer its signature scheme from this review.
2. Complete common send/webhook persistence, idempotency, uncertain-send reconciliation, early receipts, and persistent AI jobs with pause recheck. Current behavior cannot guarantee recovery or one logical message under concurrency.
3. Implement transactional event publication and resumable SSE with gap recovery, and validate session/conversation authorization and Dokploy buffering under real disconnect/restart.
4. Integrate private audio into outbound and inbound flows, add a real decoding/conversion strategy and retry handling, and test Android/iOS playback and media isolation. The existing public storage path is a separate reported security concern.
5. Instrument the actual application and phone observer, supply a staging driver and test data, execute migration/rollback on an isolated copy and pilot account, and retain sanitized evidence. The test specification and collector alone do not establish any end-to-end outcome.
