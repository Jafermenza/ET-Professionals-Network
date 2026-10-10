# Workflow Reconciliation Matrix

**Status:** Initial evidence inventory — not an acceptance sign-off  
**Working branch:** `reconciliation/holistic-gates`  
**Contract anchors:** `docs/01-product-requirements.md`, `docs/03-domain-model.md`, `docs/04-roles-and-permissions.md`, `docs/05-workflows.md`, `docs/07-api-contract.md`, `docs/08-security-privacy.md`, `docs/11-quality-acceptance.md`.

## Evidence rules

- **Confirmed connected** means the screen actually calls the documented API and presents the result; a route or service existing is not sufficient.
- **Partial** means at least one part of the chain exists but the full user journey is not yet proven.
- **Gap** means the inspected screen is static, has a non-functional control, or does not call the API required for its stated action.
- **Not tested** means no passing end-to-end evidence has been recorded. Do not infer success from code shape.
- Sensitive evidence, membership status, and organization resources must remain server-authorized; client-side hiding is not authorization.

## Screen → API → service → persistence inventory

| Journey / screen | API evidence observed on branch | Service / persistence boundary | Current UI evidence | Status / required proof |
|---|---|---|---|---|
| Login / account profile | `POST /api/v1/auth/login`, `GET /api/v1/me`, `POST /api/v1/auth/logout` | Membership/auth and user-admin services; PostgreSQL sessions and audit | CI smoke logs in, reads `/me`, logs out, then verifies revoked-token denial | **PARTIAL** — add browser flow, invalid credentials, expiry and role-change negative tests |
| Public jobs discovery | `GET /api/v1/jobs` supports query/scope filters; `GET /api/v1/jobs/{id}`; `POST/DELETE /api/v1/jobs/{id}/save`; `GET /api/v1/me/saved-jobs`; `POST /api/v1/me/job-alerts` | `src/organization-jobs/service.js`; PostgreSQL jobs, saved jobs and alert criteria | `web/app/jobs/page.tsx` fetches live records, wires supported filters, loads saved IDs, persists save/unsave and creates a daily in-app alert from current criteria; details load from the job endpoint | **IMPLEMENTED / CI BUILD PASS** — browser E2E, actual signed-in saved-state visibility and API failure/empty paths still need end-to-end assertions. The public inquiry CTA remains a short intake path, not a claim that a formal application was submitted |
| Job inquiry / application | `POST /api/v1/jobs/{id}/application-drafts`, `POST /api/v1/jobs/{id}/apply`, `POST /api/v1/job-applications/{id}/submit`; public intake is exposed separately through apply flow | Organization/job service and application state persistence | `web/app/apply/job/page.tsx` is the candidate integration point; public discovery page links all sample cards to a generic inquiry | **PARTIAL** — verify ID-specific application flow, eligibility, duplicate submission, persisted state and candidate-only visibility |
| Mentorship discovery | `GET /api/v1/mentors`; `POST /api/v1/mentorship/requests`; match, response, goals, sessions and feedback routes exist | `src/services-mentorship/service.js`; mentor profiles, availability, requests, matches and sessions | `web/app/mentorship/page.tsx` fetches current mentor profiles and submits an authenticated goal/topic/language/mode request with optional preferred mentor. Server validates session and applies visibility rules. | **IMPLEMENTED / CI SMOKE PASS** — request creation and matching still need browser E2E and persisted-state verification. No placeholder scores, languages or availability are invented |
| Professional services discovery | `GET /api/v1/services`, `GET /api/v1/services/{id}`, `POST /api/v1/services/{id}/requests`, `GET /api/v1/me/service-requests` | `src/services-mentorship/service.js`; service listings, requests, milestones, deliveries, feedback | `web/app/services/page.tsx` loads published listings, searches supported terms, creates an authenticated request and lists the account's requests | **IMPLEMENTED / CI BUILD PASS** — add browser E2E for active-member requirement, self-request denial, duplicate request and provider transition outcomes |
| Organization onboarding | `POST /api/v1/organizations`, `GET /api/v1/organizations`, `GET /api/v1/organizations/{id}`, evidence, verification submission and member routes | `src/organization-jobs/service.js`; organizations, memberships, verification cases/evidence and audit log | `web/app/organizations/page.tsx` now registers organizations and lists those associated with the signed-in account; verification submission calls the API. The screen explicitly discloses that private file upload is not yet implemented. | **PARTIAL** — registration/list are connected; evidence upload and full verification journey remain open. Test duplicate organization, organization-role scope, private-file ownership and failed/missing-evidence paths |
| Organization public job inquiries | `GET /api/v1/opportunity-inquiries?type=job`, `PATCH /api/v1/opportunity-inquiries/{id}` | Public opportunity service; inquiry state and audit | Screen fetches list when token exists, but swallows errors as an empty list; no decision control is visible in inspected component | **PARTIAL** — distinguish loading, empty and API failure; expose only authorized decisions and test cross-organization denial |
| Profile / talent visibility | `GET /api/v1/me`, `PATCH /api/v1/me/profile`, `PATCH /api/v1/me/talent-profile`, `GET/PATCH /api/v1/me/talent-visibility` | Membership and talent services; profile/visibility persistence | `web/app/profile/page.tsx` was identified in initial scan as lacking API calls | **GAP TO VERIFY** — inspect current component and connect fields to explicit API contracts; add privacy/visibility regression tests |
| Field operations / offline evidence | Workflow contract defines client UUID, operation timestamp/type, sync state and entity-specific conflict policy | Field/project services and file evidence storage | Full screen-to-route behavior and offline retry semantics not yet inspected | **NOT TESTED** — map actual implementation before claiming offline support; never blind last-write-wins for consequential records |
| Admin and role management | Auth middleware reloads DB roles; role mutation revokes sessions; logout audits | User-admin/auth services, sessions and audit log | API-level smoke covers logout only; admin UI role matrix not yet traced | **PARTIAL** — prove role-by-role allow/deny, current-role enforcement, revocation and separation of duties |
| Reference Portfolio | Existing test/service modules and contract identified in Gate 0 | Reference dataset versions/items, validation and publication | UI and full import→validate→publish journey not yet traced in this matrix | **NOT TESTED** — preserve authoritative source constraints; add import failure/retry and published-version tests |

## Gate 4 verification and completion order

1. **Jobs discovery** — browser-test live search and filters, job details, signed-in save/unsave persistence, alert creation, empty results and API failures. Confirm that a public inquiry is not misrepresented as a formal application.
2. **Services discovery/request** — test the active-membership requirement, self-request denial, duplicate request behavior, request listing for permitted participants and provider state transitions.
3. **Mentorship discovery/request** — test anonymous public visibility versus authenticated member visibility, required goals, preferred mentor handling, duplicate/retry behavior and persisted request state.
4. **Organization onboarding** — test duplicate legal names, owner membership, organization-scoped reads/writes, private file ownership, required verification evidence and failed/missing-evidence paths. Complete a secure upload UI only after confirming the repository's file-object creation/upload contract.
5. Add browser E2E and service/API assertions for successful, unauthorized, invalid-state, duplicate/retry, not-found and empty-result paths where applicable. Update this matrix in the same branch as fixes; a connected UI is not considered acceptance evidence until its state transitions are tested.

## Gate 3 migration evidence

The migration runner and CI now cover the following on isolated PostgreSQL 16:

- Fresh install of the full migration chain and a no-op rerun.
- Legacy schema adoption from the known test baseline `010_phase3_hardening.sql` after applying migrations 001–010 without a ledger.
- Fail-closed behavior when an existing schema has no migration history and no explicit baseline.
- Preservation of a pre-existing sentinel row while migrations 011–018 are applied.
- A synthetic failing migration proving the DDL and its ledger row roll back together.
- Complete ledger population (18 SQL migrations), followed by a no-op rerun.
- CI push run [38050311573](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050311573) and PR run [38050314006](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050314006), commit `b28574fc20b7ad0407bba2968e2f48ffae961445`.

**Boundary:** these are disposable-database results only. The real production schema and baseline remain unverified; use the mandatory [migration operations runbook](32-migration-operations-runbook.md) before any production migration.

## Acceptance record

| Evidence | Result |
|---|---|
| CI run `38046124168`, commit `e6ad212a847cb3597688e4bbfc6f56aa3787b11b` | PASS: install, fresh migrations, migration rerun, test suite, web build, API smoke including public/member mentor discovery |
| CI PR run `38045220106` | PASS: same configured pipeline |
| Browser E2E for jobs/services/mentorship/organization journeys | NOT RUN — connected screens still require persisted-state and negative-path browser verification |
| Disposable PostgreSQL legacy adoption + data sentinel + rollback + rerun | PASS — push run [38050311573](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050311573), PR run [38050314006](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050314006), commit `b28574fc20b7ad0407bba2968e2f48ffae961445` |
| Existing production schema baseline verified | NOT RUN — mandatory before production migration |
| Committed dependency lockfile / `npm ci` | OPEN |
| Production deployment | NOT PERFORMED |

Update this record only when fresh evidence exists; a planned test is not a passing test.
