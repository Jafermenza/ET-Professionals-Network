# Holistic Application Reconciliation Plan

**Status:** Active — G1 CI evidence green; G2 partial; G3 passed on disposable PostgreSQL (production baseline remains unverified); G4 workflow reconciliation underway; G5/G6 not passed  
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
- `docs/32-migration-operations-runbook.md` — mandatory legacy-baseline verification, backup/restore, migration execution, and recovery checklist.
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
| R-02 | API contract | Two `GET /api/v1/me` handlers existed; the first returned only account/role data and shadowed the later profile response consumed by the dashboard. | **Fix committed on this branch:** removed the shadowing handler; CI passed on the resulting server change. Add a focused authenticated route contract test during G5. |
| R-03 | Authorization | Tokens contain role claims while account sessions are checked against the database. A role change may leave old role claims active until expiry unless sessions are revoked or roles are reloaded. | Trace every privileged route and role mutation; test role grant/removal and session revocation. |
| R-04 | Migrations | The original runner had no history ledger and reran every SQL file on every invocation. | **Fix under CI validation:** migration runner now records filename + SHA-256 checksum, refuses edits to already-applied migration files, and applies each new migration and ledger entry in one transaction. CI now runs the migration command twice. A fresh-DB rerun is not a substitute for validating an existing-schema upgrade. |
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

Evidence reviewed on 2026-10-10 (latest implementation commit below):

- G0: **IN PROGRESS** — the core contracts and initial risk inventory are recorded. The complete screen-to-route-to-service trace and legacy database inventory are not finished; see [the workflow reconciliation matrix](31-workflow-reconciliation-matrix.md).
- G1: **PASS for commit `104ea6b13d8900a1d296a1f82219851c1d4b2d4a`** — GitHub Actions run [38047078197](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38047078197) completed successfully. It passed `npm install --no-audit --no-fund`, fresh PostgreSQL migrations, migration rerun, `npm test`, `npm run web:build`, and the application smoke test. Tests now also cover explicit migration-baseline selection and checksum-mismatch rejection, while smoke tests cover public/authenticated mentor discovery and the login/profile/logout/revoked-session journey. This is command-level CI evidence, not full browser E2E. Root `package-lock.json` is still absent; `npm ci` reproducibility remains OPEN.
- G2: **PARTIAL** — current DB roles replace stale JWT role claims; role changes revoke sessions; the duplicate `GET /api/v1/me` route shadow was removed; logout now revokes the session and audits `account.logout`. CI verifies login/profile/logout/revoked-session and anonymous/authenticated mentor discovery. Mentor discovery was corrected to bind its viewer parameter and hide member-only profiles from anonymous viewers; the route validates any supplied bearer session before using it for member visibility. Full positive/negative role matrix, organization ownership boundaries, privacy checks and admin separation-of-duties tests remain OPEN.
- G3: **PASS — disposable PostgreSQL acceptance; production rollout remains blocked pending baseline verification.** CI runs [push 38050311573](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050311573) and [PR 38050314006](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050314006) passed on commit `b28574fc20b7ad0407bba2968e2f48ffae961445`. The isolated legacy-adoption test builds migrations 001–010 without a ledger, adds a sentinel row, verifies that a missing baseline fails closed, adopts the exact test baseline, applies migrations 011–018, verifies all 18 ledger rows and sentinel preservation, injects a failing migration to prove DDL and ledger writes roll back together, removes the synthetic migration, and proves a clean rerun. Fresh database migration and ordinary rerun also pass. Historical migration 012 remains untouched; forward migration 018 reconciles the constraint. **The production schema and correct production baseline have not been inspected. Do not set a production baseline by assumption; follow `docs/32-migration-operations-runbook.md` before any production migration.**
- G4: **IN PROGRESS / NOT PASSED** — initial integration work is now on the branch: jobs discovery uses live API data and filters, saved jobs and daily in-app job alerts call their endpoints; mentorship discovery uses live mentor profiles and submits authenticated goal-based requests; services discovery uses published API listings and creates service requests, then displays the user's requests; organization registration and organization listing are API-backed. The organization evidence-upload UI is still incomplete because the inspected API requires a private owned file object and this screen does not yet implement that upload flow. CI build and smoke pass, but browser E2E, persisted-state checks and negative workflow paths remain open.
- G5: **NOT PASSED** — smoke tests are not role-separated browser E2E; full persisted-state and negative-path journey evidence is outstanding.
- G6: **NOT PASSED** — backup/restore, rollback rehearsal, production-like readiness and residual-risk acceptance remain outstanding.
- No production database has been touched. No deployment or merge has been performed. No advertised feature has intentionally been removed or disabled.

### Required next sequence

1. Complete G0 route-to-screen and contract inventory, including exact API request/response shapes and authorization boundaries.
2. Close G1 dependency reproducibility by generating and committing the workspace-compatible lockfile, then switch CI to `npm ci` and verify clean install.
3. Complete G2 role/scope negative tests before claiming authorization is passed.
4. Keep production migration blocked until an operator verifies the actual production schema against a reviewed backup/restore copy and records the exact baseline using `docs/32-migration-operations-runbook.md`. G3's disposable-database acceptance is complete; production baseline verification is an explicit operational prerequisite, not an inferred PASS.
5. For G4, connect one workflow at a time (jobs, mentorship, services, organization onboarding), with loading/empty/error states and service/API regression tests. Keep every change on `reconciliation/holistic-gates`.
6. Run G5 and G6 only after their acceptance criteria and evidence are available.

This roadmap is evidence-driven: green CI is tied to a specific commit and is not a claim that all product workflows are complete.
