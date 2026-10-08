# Implementation Plan

## 1. Strategy

Build vertical slices. Each phase must produce working business value rather than isolated database tables or screens.

## Phase 0 — Foundation

Repository, environments, CI, database, authentication, authorization, logging, audit foundation, file storage abstraction, notification abstraction and payment abstraction.

Exit: deployable application, protected endpoint, migrations, tests, structured logging and no secrets committed.

## Phase 1 — Identity and Membership

Account, person, profile, membership application, review, correction, payment, activation, renewal, history and notifications.

Exit: a real user can register, apply, be reviewed, pay, become active and renew.

## Phase 2 — Verification and Talent Registry

Verification cases, configurable verification programs/checklist snapshots, evidence metadata and secure file references, reviewer workspace, claim-level decisions, response/appeal controls, professional talent profile, directory, search/filter, saved searches and visibility controls.

Exit: an organization-ready consumer can find an active eligible verified professional through the canonical talent registry without seeing private evidence, reviewer notes or confidential verification material. Phase 3 organizations consume this registry rather than create a second talent directory.

Implementation:
- Migration 006: verification case/evidence/decision/response/appeal/reference/concern model and verification roles.
- Migration 007: structured professional profile, reference-linked attributes, experience and explicit directory visibility.
- Verification service: case lifecycle, evidence, checklist results, claim verification, decisions and appeals.
- Talent service: privacy-safe profile projection, verified eligibility search, filters and saved searches.
- Server routes: member profile/visibility, talent discovery and reviewer workspace.
- Acceptance: see docs/27-phase-2-verification-talent-registry.md.

## Phase 3 — Organizations and Jobs

Organization registration/verification, scoped organization users, public jobs, exclusive jobs, centralized eligibility engine, candidate applications and candidate workflow management.

Implementation:
- Migration 009: organization identity/verification, scoped organization memberships, jobs, eligibility rules, applications, application attachments and application events.
- Organization/jobs service: organization registration and verification, organization-user management, job lifecycle, centralized eligibility evaluation, applications and candidate status workflow.
- Server routes: public job discovery, organization workspace, verification review, job publishing, eligibility preview, applications and candidate management.
- Acceptance: see docs/28-phase-3-organizations-jobs.md.

Exit: a verified organization can publish and manage candidates; an eligible member can apply to an exclusive job.

## Phase 4 — Services and Mentorship

Service listings, service requests, mentor profiles, availability, matching, mentorship lifecycle, sessions and feedback.

Exit: member can offer a service and receive request; mentee can complete mentorship lifecycle.

## Phase 5 — Events and Calendar

Event management, registration, attendance, ICS, provider abstraction, rescheduling and notifications.

Exit: attendee remains linked after rescheduling and receives updated information.

## Phase 6 — Moodle and Certification

Course bridge, SSO, enrollment, completion sync, certificate records and monitoring.

Exit: user can access Moodle through approved SSO and completion appears in MPA.

## Phase 7 — Projects, Volunteers and Donations

Projects, participants, volunteers, donations, payment reconciliation, progress and public updates.

Exit: project can receive donation with auditable project/financial record.

## Phase 8 — Field Evidence and Inspection

Field visits, evidence, offline queue, sync, inspection workflow, correction and publication.

Exit: intermittent connectivity does not prevent field data capture and central review.

## Phase 9 — Intelligence

Recommendations, talent matching, analytics, stakeholder insights and impact dashboards only after sufficient real data exists.

AI must not replace verification or governance decisions.

## 2. Release rules

Each phase requires requirements, UX, data model, API contract, implementation, automated tests, security review, acceptance tests, migration plan and operational documentation.

## 3. Issue labels

type:feature
type:bug
type:security
type:technical-debt
area:membership
area:verification
area:jobs
area:mentorship
area:events
area:learning
area:projects
area:payments
area:platform

## 4. Definition of Ready

Problem is clear, acceptance criteria exist, dependencies are known, permissions are identified, data impact is identified and UI/API impact is identified.

## 5. Definition of Done

Implementation complete, migrations complete, tests pass, authorization tested, errors handled, audit behavior implemented where required, documentation updated, CI passes and reviewer approves.

## 6. Sequencing rule

Do not start with the dashboard. Build domains and workflows first; dashboard screens should visualize real business states.
