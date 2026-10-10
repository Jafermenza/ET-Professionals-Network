# Holistic Application Reconciliation Plan

**Status:** Active — Gate 0 baseline recorded; implementation gates not yet passed  
**Working branch:** `reconciliation/holistic-gates`  
**Base branch:** `main`  
**Scope:** One auditable branch for build reliability, authorization, database safety, connected workflows, end-to-end verification, and release readiness.

## 1. Non-negotiable contract

This plan supplements, and does not silently replace, the existing product and engineering contracts. Where an implementation change alters product behavior, update the corresponding source contract in the same change set.

Authoritative references:
- `docs/01-product-requirements.md` — product scope and requirements.
- `docs/03-domain-model.md` — entities and domain invariants.
- `docs/04-roles-and-permissions.md` — authentication, authorization, scope, separation of duties, and audit.
- `docs/05-workflows.md` — business state transitions and user journeys.
- `docs/06-system-architecture.md` — architectural boundaries.
- `docs/07-api-contract.md` — API behavior, errors, idempotency, and integrations.
- `docs/08-security-privacy.md` — privacy and security requirements.
- `docs/11-quality-acceptance.md` — test and release acceptance.
- `docs/12-developer-guide.md` — module boundaries and change documentation.
- `docs/20-reference-portfolio-implementation.md` — Reference Portfolio implementation constraints.

### Change-control rules

1. Do not delete or disable an existing feature merely to make a build or test pass.
2. Do not relax authentication, authorization, privacy, validation, or audit rules to make a workflow pass.
3. Do not perform destructive data migrations or rewrite production data without a reviewed migration and explicit recovery plan.
4. Every defect must have a reproducible test or a documented reason why automation is not feasible.
5. Keep fixes focused and backward-compatible where practical; document any necessary API or schema compatibility change.
6. A gate is **PASS** only when its acceptance evidence is recorded. A plan, code review, or CI configuration alone is not proof of execution.
7. Never record secrets, real identity evidence, production credentials, or unnecessary personal data in tests or logs.
8. Keep all reconciliation work on this branch until the pull request is reviewed. Do not merge or deploy automatically as part of this plan.

## 2. Gate model

| Gate | Purpose | Required exit evidence |
|---|---|---|
| G0 — Contract and baseline | Map contracts, workflows, routes, modules, migrations, test/build commands, and known risks | This plan committed; baseline and open questions recorded |
| G1 — Reproducible build | Clean dependency installation, test command validity, web production build, server startup and health check | Reproducible command results; failures fixed without suppressing tests |
| G2 — Identity and authorization | Session lifecycle, current roles, protected routes, resource scope, privacy and admin actions | Positive and negative authorization tests, including role changes and revoked sessions |
| G3 — Database and migrations | Fresh database, upgrade path, migration history/idempotency, transaction safety and seed behavior | Fresh-install and upgrade evidence on disposable PostgreSQL; rerun behavior documented |
| G4 — Domain workflow integration | Connect UI/API/service/database/state transition/audit/notification/follow-up for each implemented capability | Route-to-screen matrix and service/API tests for positive, negative and retry paths |
| G5 — End-to-end acceptance | Run role-separated user journeys against a real test server and PostgreSQL | E2E results, persisted-state checks, and regression evidence |
| G6 — Release readiness | Operational diagnostics, backup/restore, rollback, security review and production-like smoke tests | Release checklist with evidence and explicitly accepted residual risks |

Gates are sequential for acceptance. A later gate may reveal work for an earlier gate; record the regression, reopen the affected gate, and do not hide the dependency.

## 3. Gate 0 — initial repository baseline

### Repository facts observed from the current `main` branch

- Root runtime is Node.js ESM with a built-in HTTP server in `server.js`.
- The web workspace is `web/`, using Next.js 14 and React 18.
- PostgreSQL access uses `pg`; SQL migrations are under `db/migrations/`.
- Root scripts currently declare `test`, `test:reference-portfolio`, `start`, `migrate`, `web:build`, and `web:dev`.
- CI is defined in `.github/workflows/ci.yml`; it provisions PostgreSQL 16, runs `npm install`, migrations, tests, web build and a `/healthz` smoke check.
- The migration runner in `scripts/migrate.js` enumerates and executes every sorted SQL migration on every run. A migration ledger and safe rerun behavior have not yet been demonstrated.
- The product contracts explicitly require server-side authorization and resource scope, privacy of sensitive evidence, auditable state changes, idempotent consequential operations, realistic migration tests, and end-to-end acceptance.
- The repository tree currently contains no npm, pnpm or Yarn lockfile. Existing CI uses `npm install`, so dependency resolution is not yet pinned by a committed lockfile.
- Existing test files cover identity/password validation, platform foundation/theme, membership import and lifecycle, Reference Portfolio validation/service, verification, organizations/jobs, and services/mentorship.
- The web app contains public landing, registration/login, profile, dashboard, admin, field operations, jobs/apply, network, organizations, services, mentorship, opportunity intake, and inquiry tracking screens.
- Only one CI workflow is present in the repository tree. It runs a migration/test/build/smoke sequence but does not itself demonstrate browser E2E coverage of every advertised capability.

### Initial risk register — hypotheses to verify during the gates

| ID | Area | Initial observation / risk | Required proof or action |
|---|---|---|---|
| R-01 | Build/CI | No lockfile is present; CI uses `npm install`. | Establish reproducible workspace dependency resolution; commit the appropriate lockfile and use `npm ci` where supported. |
| R-02 | API contract | A duplicate `GET /api/v1/me` handler was identified in the initial code review; the later handler may be unreachable. | Trace both route definitions and frontend consumers; add a contract test before selecting the canonical response. |
| R-03 | Authorization | Tokens contain role claims while account sessions are checked against the database. A role change may leave old role claims active until expiry unless sessions are revoked or roles are reloaded. | Trace every privileged route and role mutation; test role grant/removal and session revocation. |
| R-04 | Migrations | The runner has no visible migration-history ledger and invokes every SQL file on every run. | Inspect every migration for repeat safety and partial-failure behavior; test fresh install, upgrade and rerun on disposable databases. |
| R-05 | Rate limiting | Public request limits are held in an in-process map. | Assess process restarts, multiple instances and key retention; document the actual deployment assumptions and suitable bounded/shared alternative if needed. |
| R-06 | End-to-end coverage | Configured CI commands do not by themselves prove every product workflow is connected. | Build an inventory from UI screens to routes, services, tables, state changes, audit and user-visible follow-up. |
| R-07 | Branch feedback | The CI push filter initially excluded `reconciliation/**`, preventing immediate push validation on the agreed working branch. | Fixed in this branch by adding `reconciliation/**` to the push branches. Confirm the resulting workflow run. |

These are **open risks**, not claims that all affected workflows are broken. Each must be confirmed or closed with evidence.

## 4. Workflow reconciliation inventory

For every workflow that is implemented or advertised, trace the full chain:

`User/UI -> API route -> input validation -> authentication -> authorization/scope -> domain service -> transaction/persistence -> audit/event -> notification/integration -> user-visible result`

Mark a step **not applicable** only with a reason. Mark a capability **not implemented** rather than inventing a successful path.

Minimum workflow families:
- Account registration, login, logout, session expiry/revocation, profile read/update.
- Membership application, review/correction, manual payment review, activation, renewal, suspension and historical periods.
- Professional verification, evidence privacy, reviewer decisions, expiry/revocation and appeal/correction where implemented.
- Organization onboarding, organization membership/role scope, verification and ownership checks.
- Job creation, publication eligibility, public discovery, application tracking, employer/candidate visibility and close.
- Talent discovery, consent-controlled profile visibility, inquiry creation and inquiry continuation/linking.
- Professional service listings, service requests, acceptance/decline and outcomes.
- Mentorship request, matching, accept/decline, capacity, sessions, completion and feedback.
- Notifications, preferences, retry/duplicate handling and audit history.
- Admin user status/role changes, session revocation, separation of duties and recovery.
- Reference data and Reference Portfolio import/validation/publication, preserving the rule that authoritative classifications must not be fabricated.

## 5. Standard test evidence

For each change, record:
- Gate and risk/requirement IDs.
- Contract(s) affected.
- Exact command or test name.
- Environment class (unit, disposable database, browser/E2E, staging); never expose secrets.
- Result: PASS / FAIL / BLOCKED / NOT RUN.
- Failure output summarized safely, linked to the fix, and regression coverage.
- Database setup/cleanup and whether the test is repeatable.
- Any API/schema compatibility, migration, privacy, audit, or operational consequence.

A failed test must remain visible. Do not replace a failing assertion with a weaker one solely to obtain a green build.

## 6. Current status and next action

- G0: **IN PROGRESS** — initial contracts and inventory are recorded; finish route-to-screen tracing and migration rerun analysis.
- G1: **PASS — initial CI baseline only** — the pull-request CI run `38041774483` completed successfully for commit `da1cec8b1d2e0951fa7a59f871b6e8d692869377`. It passed dependency installation, migrations on a fresh CI PostgreSQL service, the configured test suite, Next.js production build, and `/healthz` smoke test. Subsequent security/API commits have not yet been validated by a completed CI run; rerun CI after the latest changes. The successful install used `npm install`, not `npm ci`, so dependency lockfile reproducibility remains open.
- G2: **IN PROGRESS** — server authentication now reloads current database roles for every authenticated request, admin role changes revoke existing sessions, and a regression test covers stale token role claims. The shadowed duplicate `GET /api/v1/me` handler has been removed so the route can return the profile contract consumed by the dashboard. These changes await CI validation and further role/scope negative tests.
- G3–G6: **NOT PASSED** — migration rerun/upgrade safety, complete route-to-screen workflow tracing, browser E2E journeys, and release-readiness checks remain open.
- The baseline CI run is evidence only for the tested commit; it does not validate later commits or prove every workflow passes.
- No production database has been touched. No application feature has been intentionally removed or disabled.

Next action: confirm CI after the latest G2 fixes, inspect all migrations for rerun/partial-failure behavior, then add tests for the authorization and data invariants before advancing the gates.
