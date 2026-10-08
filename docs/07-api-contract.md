# API and Integration Contract

## 1. Purpose

This document defines API principles and resource contracts. Framework syntax may vary, but business semantics must remain stable.

## 2. API conventions

Base path: /api/v1

Every protected endpoint validates authentication, authorization, resource scope and business eligibility.

## 3. Resource groups

Authentication:
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/verify
POST /auth/password/reset

Membership:
GET /memberships/me
POST /memberships/applications
GET /memberships/applications/{id}
POST /memberships/applications/{id}/submit
POST /memberships/{id}/renew

Profiles:
GET /profiles/me
PATCH /profiles/me
GET /professionals
GET /professionals/{id}

Verification:
POST /verification/cases
GET /verification/cases/{id}
POST /verification/cases/{id}/submit
POST /verification/cases/{id}/decision

Organizations:
POST /organizations
GET /organizations/{id}
POST /organizations/{id}/members
POST /organizations/{id}/verification

Jobs:
POST /jobs
GET /jobs
GET /jobs/{id}
POST /jobs/{id}/publish
POST /jobs/{id}/applications
GET /jobs/{id}/applications

Services:
POST /services
GET /services
POST /services/{id}/requests

Mentorship:
POST /mentorship/requests
GET /mentorship/requests/{id}
POST /mentorship/requests/{id}/accept
POST /mentorship/{id}/sessions

Events:
POST /events
GET /events
POST /events/{id}/register
POST /events/{id}/reschedule
GET /events/{id}/calendar.ics

Learning:
GET /courses
GET /learning/me
GET /certifications/me

Projects:
POST /projects
GET /projects
GET /projects/{id}
POST /projects/{id}/participants
POST /projects/{id}/visits
POST /projects/{id}/evidence

Donations:
POST /donations
GET /donations/{id}

Payments:
POST /payments
GET /payments/{id}
POST /payments/webhooks/{provider}

Notifications:
GET /notifications
PATCH /notifications/{id}/read
GET /notification-preferences

## 4. State-changing APIs

Prefer explicit commands such as POST /memberships/{id}/approve rather than allowing arbitrary PATCH of status. This makes authorization and auditing clear.

## 5. Errors

Use stable business error codes and field-level validation.

Example conceptual response:

{
  "error": {
    "code": "MEMBERSHIP_NOT_ELIGIBLE",
    "message": "The membership cannot be renewed in its current state.",
    "details": {"status": "SUSPENDED"},
    "requestId": "..."
  }
}

Never expose stack traces.

## 6. Pagination/filtering

List endpoints must support stable pagination. Filtering and sorting use documented, whitelisted fields.

## 7. Idempotency

Payment creation and other consequential commands accept Idempotency-Key. Repeating the same key must not create a second financial operation.

## 8. File upload contract

Recommended flow:
1. request upload authorization;
2. receive signed upload target;
3. upload object;
4. confirm upload;
5. server validates metadata/checksum;
6. file becomes available.

Never trust client MIME type alone.

## 9. Payment contract

The domain uses a provider-neutral Payment record.

The adapter maps amount, currency, customer, purpose, callback and provider reference.

Webhook processing must authenticate the provider where supported, validate the event, find the payment, safely ignore duplicates, update state and publish a domain event.

## 10. Moodle contract

MPA is identity/business layer. Moodle is learning execution layer.

Support SSO, course discovery/catalog synchronization where needed, enrollment, completion, certificate records and synchronization errors. Store external IDs.

## 11. Calendar contract

ICS generation is the baseline. Provider-specific integrations may be added.

Rescheduling must preserve event identity and update synchronized calendars where authorized.

## 12. Messaging contract

Templates are versioned/configurable.

Delivery records include message ID, channel, recipient reference, template, provider, status, provider message ID, timestamps and failure reason.

## 13. Versioning

Breaking API changes require a documented version strategy. Existing clients must not be silently broken.
