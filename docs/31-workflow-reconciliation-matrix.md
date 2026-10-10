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
| Public jobs discovery | `GET /api/v1/jobs` supports query/scope filters; `GET /api/v1/jobs/{id}` | `src/organization-jobs/service.js`; PostgreSQL jobs and organization eligibility | `web/app/jobs/page.tsx` defines a hard-coded `jobs` array; search/filter controls are not wired; bookmark and “Save job alert” are not connected to handlers | **GAP** — replace sample data with API results, wire safe filters and real job detail/application CTA, and test empty/error/loading states |
| Job inquiry / application | `POST /api/v1/jobs/{id}/application-drafts`, `POST /api/v1/jobs/{id}/apply`, `POST /api/v1/job-applications/{id}/submit`; public intake is exposed separately through apply flow | Organization/job service and application state persistence | `web/app/apply/job/page.tsx` is the candidate integration point; public discovery page links all sample cards to a generic inquiry | **PARTIAL** — verify ID-specific application flow, eligibility, duplicate submission, persisted state and candidate-only visibility |
| Mentorship discovery | `GET /api/v1/mentors`; `POST /api/v1/mentorship/requests`; match, response, goals, sessions and feedback routes exist | `src/services-mentorship/service.js`; mentor profiles, availability, requests, matches and sessions | `web/app/mentorship/page.tsx` defines hard-coded mentors and static sector/goal/time fields; request CTA points to generic `/apply/mentorship` | **GAP** — fetch actual mentor list, bind a request to selected mentor or documented matching contract, submit user goal/preferences, show request status and handle unavailable/empty/error results |
| Professional services discovery | `GET /api/v1/services`, `GET /api/v1/services/{id}`, `POST /api/v1/services/{id}/requests`; provider listing and request-state routes exist | `src/services-mentorship/service.js`; service listings, requests, milestones, deliveries, feedback | `web/app/services/page.tsx` is explanatory content with a “Browse services” button and no API call/submit action | **GAP** — render API-backed listing/detail, connect request form and request status, preserve membership/provider rules and legal state transitions |
| Organization onboarding | `POST /api/v1/organizations`, `GET /api/v1/organizations`, `GET /api/v1/organizations/{id}`, evidence, verification submission and member routes | `src/organization-jobs/service.js`; organizations, memberships, verification cases/evidence and audit log | `web/app/organizations/page.tsx` loads opportunity inquiries when authenticated; “Start registration” is a button without an action; evidence card has no upload/submit flow | **PARTIAL / GAP** — keep inquiry list, wire create organization and owned-organization selection, private evidence upload and verification submission; test organization-role scope and private-file ownership |
| Organization public job inquiries | `GET /api/v1/opportunity-inquiries?type=job`, `PATCH /api/v1/opportunity-inquiries/{id}` | Public opportunity service; inquiry state and audit | Screen fetches list when token exists, but swallows errors as an empty list; no decision control is visible in inspected component | **PARTIAL** — distinguish loading, empty and API failure; expose only authorized decisions and test cross-organization denial |
| Profile / talent visibility | `GET /api/v1/me`, `PATCH /api/v1/me/profile`, `PATCH /api/v1/me/talent-profile`, `GET/PATCH /api/v1/me/talent-visibility` | Membership and talent services; profile/visibility persistence | `web/app/profile/page.tsx` was identified in initial scan as lacking API calls | **GAP TO VERIFY** — inspect current component and connect fields to explicit API contracts; add privacy/visibility regression tests |
| Field operations / offline evidence | Workflow contract defines client UUID, operation timestamp/type, sync state and entity-specific conflict policy | Field/project services and file evidence storage | Full screen-to-route behavior and offline retry semantics not yet inspected | **NOT TESTED** — map actual implementation before claiming offline support; never blind last-write-wins for consequential records |
| Admin and role management | Auth middleware reloads DB roles; role mutation revokes sessions; logout audits | User-admin/auth services, sessions and audit log | API-level smoke covers logout only; admin UI role matrix not yet traced | **PARTIAL** — prove role-by-role allow/deny, current-role enforcement, revocation and separation of duties |
| Reference Portfolio | Existing test/service modules and contract identified in Gate 0 | Reference dataset versions/items, validation and publication | UI and full import→validate→publish journey not yet traced in this matrix | **NOT TESTED** — preserve authoritative source constraints; add import failure/retry and published-version tests |

## Gate 4 implementation order

1. **Jobs discovery** — remove hard-coded records, call `GET /api/v1/jobs`, support query/filter parameters actually accepted by the API, use returned job IDs for details and applications, and remove fake controls unless they are implemented.
2. **Services discovery/request** — connect listing, details and request submission to existing endpoints; display current user's requests from `GET /api/v1/me/service-requests`.
3. **Mentorship discovery/request** — connect mentor data and request creation, with no invented match score, languages, or availability; render only server-returned attributes.
4. **Organization onboarding** — wire organization registration and verification steps with private evidence and server-authorized organization membership.
5. For every item, add unit/service/API tests for successful, unauthorized, invalid-state, duplicate/retry, not-found and empty-result paths where applicable. Update this matrix in the same PR commit as implementation.

## Acceptance record

| Evidence | Result |
|---|---|
| CI run `38045217283`, commit `90f5d8ed9df7bd306194b231e14b9faeb24cd011` | PASS: install, fresh migrations, migration rerun, test suite, web build, authenticated API smoke |
| CI PR run `38045220106` | PASS: same configured pipeline |
| Browser E2E for jobs/services/mentorship/organization journeys | NOT RUN |
| Existing production schema baseline verified | NOT RUN |
| Committed dependency lockfile / `npm ci` | OPEN |
| Production deployment | NOT PERFORMED |

Update this record only when fresh evidence exists; a planned test is not a passing test.
