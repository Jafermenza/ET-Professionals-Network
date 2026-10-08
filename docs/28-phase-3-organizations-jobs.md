# Phase 3 — Organizations and Jobs

## Objective

Provide a verified organization workspace and a controlled employment workflow that consumes the Phase 2 canonical talent registry. Organizations do not create a second talent directory.

The Phase 3 exit is:

> A verified organization can publish and manage candidates, and an eligible member can apply to an exclusive job.

## Organization lifecycle

Organization identity is separate from platform user identity and organization authorization.

1. Authenticated user registers an organization.
2. The creator becomes the scoped owner.
3. A verification case is created.
4. Organization evidence is attached through secure file references.
5. Organization submits verification.
6. Authorized reviewer records verified, correction_required or rejected.
7. Only verified organizations can publish jobs.
8. Public visibility is enabled only after verification.

Organization roles are scoped to an organization: owner, administrator, recruiter, project_manager, event_manager, finance, read_only.

A role on one organization never grants access to another organization.

## Organization verification

Organization verification is a business workflow and is not inferred from the organization's name or email domain.

Verification decisions are audited with reviewer, reason and timestamp. Verification evidence remains private. Required evidence types are admin-configurable by organization type; the platform does not hard-code one document set for every Ethiopian entity. Depending on entity type and applicable law, configuration can require items such as registration/legal-existence evidence, authorization to represent the entity, TIN, business/trade licensing or sector-specific authorization.

The existing Phase 2 reviewer authorization model is reused for organization verification; a separate organization-verification evidence store prevents private organizational material from entering the talent registry.

## Jobs

Job lifecycle:

Draft -> Published -> Paused -> Closed -> Archived

A job has organization, title and description, employment type, work mode, location, optional versioned occupation/industry references, public/exclusive visibility and application deadline.

Only verified organizations may publish jobs.

Public jobs are discoverable without exposing private organization verification evidence. Exclusive jobs remain discoverable, but application is controlled by the eligibility engine.

## Eligibility engine

Eligibility is evaluated centrally in src/organization-jobs/service.js.

Supported rules:
- active membership;
- verified professional status;
- specific verified claim;
- occupation;
- industry;
- education level;
- qualification type;
- field of study;
- minimum experience;
- availability;
- location.

For exclusive jobs, the system automatically requires active MPA membership and at least one eligible professional verification claim from the Phase 2 professional eligibility set.

Organizations may add further rules.

The engine returns a decision and safe reasons. It does not expose private verification evidence, reviewer notes or confidential rule material.

## Applications

Application lifecycle:

Draft -> Submitted -> Screening -> Shortlisted -> Interview -> Offer -> Accepted -> Hired

Alternative terminal states: Rejected, Withdrawn.

The organization may manage candidate state only for applications to its own jobs.

Each application stores a safe profile snapshot and eligibility snapshot so later profile changes do not rewrite the historical application record.

Private verification evidence is not copied into an application.

Applicants may attach application documents through file references. Organizations receive only the application documents intentionally attached to that application.

## Privacy and separation of duties

- Organization permissions are scoped by organization_membership.
- Recruiters cannot access another organization's candidates.
- Candidate management does not grant verification-review permissions.
- Organization verification reviewers cannot automatically manage the organization's jobs unless separately authorized.
- Public job discovery does not expose private verification material.
- Eligibility failures return a general safe explanation.
- Critical state changes are audited.

## API surface

### Organization
- POST /api/v1/organizations
- GET /api/v1/organizations
- GET /api/v1/organizations/:id
- POST /api/v1/organizations/:id/verification-evidence
- POST /api/v1/organizations/:id/submit-verification
- POST /api/v1/organizations/:id/users
- GET /api/v1/organizations/:id/users
- PATCH /api/v1/organizations/:id/users/:userId
- POST /api/v1/review/organizations

### Jobs
- GET /api/v1/jobs
- GET /api/v1/jobs/:id
- POST /api/v1/jobs
- PATCH /api/v1/jobs/:id
- POST /api/v1/jobs/:id/publish
- POST /api/v1/jobs/:id/status
- GET /api/v1/jobs/:id/eligibility
- POST /api/v1/jobs/:id/apply
- GET /api/v1/jobs/:id/candidates
- POST /api/v1/jobs/:id/candidates/:applicationId
- GET /api/v1/me/job-applications
- POST /api/v1/job-applications/:id/attachments

## Acceptance conditions

1. Organization registration creates an organization and scoped owner membership.
2. Verification evidence is private and reviewable only through authorized workflow.
3. Required organization evidence is checked against the configured organization-type policy before submission.
4. Unverified organizations cannot publish.
5. Verified organization users can create and publish jobs.
6. Public jobs can be discovered without authentication.
7. Exclusive jobs have explicit eligibility rules, including the default active-membership + professional-verification boundary.
8. Eligibility is evaluated by one service rather than duplicated in routes.
9. Ineligible members cannot submit an exclusive application.
10. Eligible members can submit an exclusive application.
11. Organization users can view and manage candidates only for their own organization jobs.
12. Candidate status transitions are controlled and audited.
13. Application snapshots preserve the information used at submission time.
14. Private Phase 2 verification evidence is never copied into job/application records.
15. CI migration, tests and smoke test must pass before Phase 3 is accepted.

## Contract continuity

Phase 3 consumes Phase 1 account/person/membership records, Phase 2 professional profile and canonical talent eligibility, Phase 2 verification claims, versioned reference portfolio, platform audit and secure file abstractions.

It does not duplicate membership, verification, talent-directory or reference-data semantics.
