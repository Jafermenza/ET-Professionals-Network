# Requirements Traceability and Delivery Matrix

## Purpose

Every important requirement must be traceable from product intent to implementation, test and release.

## Traceability chain

Product objective -> requirement -> domain entity/workflow -> API/UI -> permission -> test -> acceptance -> release.

## Core matrix

| Requirement | Domain | Main users | Critical tests |
| --- | --- | --- | --- |
| Account | Identity | All | registration, login, recovery |
| Membership | Membership | Members/admins | application, approval, payment, renewal |
| Profile | Profile | Members | visibility, update, search |
| Verification | Verification | Members/reviewers | evidence, decision, expiry |
| Talent registry | Talent | Members/orgs/public | search, privacy, eligibility |
| Jobs | Jobs | Job seekers/orgs | publish, apply, eligibility |
| Services | Services | Members/orgs | listing, request |
| Mentorship | Mentorship | Mentors/mentees | match, sessions, completion |
| Events | Events | All | registration, capacity, reschedule |
| Moodle | Learning | Members/admins | SSO, enrollment, completion |
| Projects | Projects | Members/orgs/operations | lifecycle, permissions |
| Donations | Donations/Payments | Donors/admins | payment, allocation, receipt |
| Field evidence | Operations | Field/review | offline, sync, inspection |
| Notifications | Platform | All | preferences, delivery, retry |
| Audit | Platform | Admin/reviewers | sensitive transitions |

## Release traceability rule

A release cannot be declared complete when a requirement exists without:
- implementation reference;
- test coverage;
- acceptance result;
- known limitation if incomplete.

## Change traceability

When a business rule changes:
1. update requirement;
2. update workflow/domain model;
3. update API contract if affected;
4. update tests;
5. record decision;
6. include migration if data semantics changed.

## Risk classification

High risk:
- payments;
- membership activation;
- identity/verification;
- private documents;
- permissions;
- donation allocation;
- project financial data.

Medium risk:
- jobs;
- mentorship;
- events;
- learning synchronization.

Lower risk:
- public content;
- visual changes;
- non-critical reporting.

High-risk changes require explicit security and regression testing.
