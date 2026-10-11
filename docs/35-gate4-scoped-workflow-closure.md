# Gate 4 scoped workflow completion record

**Working branch:** `reconciliation/holistic-gates`  
**Purpose:** close executable acceptance gaps in the currently implemented domain workflows without expanding into deferred product integrations.  
**Release status:** implementation/test cases committed; final execution is still required on one exact head SHA. A committed test is not evidence that it passed.

## In-scope acceptance

### Professional service request and manual payment reconciliation

`e2e/gate4-service-payment-reconciliation.spec.js` exercises the real HTTP API and PostgreSQL-backed workflow:

1. Active provider creates and publishes a member-visible service.
2. Provider self-request is denied; another active member can request it.
3. Duplicate active request is denied.
4. Unrelated member cannot list or mutate another participant's request.
5. Only the provider can accept and start delivery.
6. Manual bank-transfer payment amount must equal the agreed amount.
7. A manual payment record is persisted as pending; an idempotent retry returns the same record.
8. The payer cannot verify their own payment; a finance/reviewer-authorized actor records the decision and evidence checked.
9. Provider completion submission does not silently count as requester acceptance.
10. Only the requester can accept the delivered outcome, after the payment is reconciled; a fresh read confirms the completed state.

This is a **manual reconciliation workflow**, not a claim of live payment-gateway processing. Provider, webhook, settlement-feed and automated refund integrations are deferred.

### Organization registration and authorization

`e2e/gate4-organization-scope.spec.js` verifies:

- duplicate legal names are rejected even when casing and surrounding whitespace differ;
- an owner can read their own organization;
- another organization's owner cannot read private details or grant themselves a role in the foreign organization.

Existing private-evidence and independent-reviewer tests remain in `e2e/gate4.spec.js`; these new tests supplement them rather than replacing or weakening their assertions.

### ATS interview feedback and candidate timeline

`e2e/gate4-ats-interview-scope.spec.js` covers a published job and submitted application, interview scheduling, candidate acceptance, feedback denial for the candidate and an unassigned platform reviewer, feedback submission by the assigned interviewer, timeline note persistence/read access for the authorized team, and denial of timeline access to an out-of-scope reviewer.

## Explicitly deferred integrations

Do not block this scoped workflow closure on building the following integrations. Do not fake their status or expose non-functional actions as operational:

- **Email/SMS:** retain persisted notification preferences and notification intent where already supported. No claim of provider delivery, retries or dead-letter processing until a provider is configured and tested.
- **Events/calendar:** event registration, rescheduling notifications and external calendar sync are not part of this scoped acceptance.
- **Moodle/learning:** no SSO, enrollment/completion synchronization or Moodle health claim in this scope.
- **Projects and related modules:** no claim of project/task-bound field evidence, volunteer lifecycle, donation allocation, receipts or project outcome tracking. The existing encrypted offline file queue is not full project synchronization.
- **Automated payment integrations:** no gateway credentials, webhooks, settlement imports or automated refunds. The supported acceptance path is manual evidence submission, finance/reviewer decision, audit and persisted reconciliation.

## Final execution gate

Run on the same final branch SHA:

1. `npm ci --no-audit --no-fund`
2. `npm run migrate` and `npm run migrate` again against isolated PostgreSQL 16.
3. `npm test`
4. `npm run web:build`
5. `npx playwright install --with-deps chromium`
6. `npx playwright test` (includes the two new scoped acceptance files).
7. Inspect the complete push and pull-request workflow results, not just workflow creation. Record passing run URLs and the exact SHA here and in `docs/31-workflow-reconciliation-matrix.md`.

No production migration or deployment is authorized by this record. If GitHub does not assign a runner, the outcome is **blocked/unexecuted**, not pass or fail.
