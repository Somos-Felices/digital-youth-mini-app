# Digital Youth — API Documentation

Version: 1.0
Date: 2026-11-04
Backend: Express + TypeScript
Database: MySQL 8

## 1. Base URL

Development:
http://localhost:4000

All request and response bodies use JSON unless otherwise specified.

## 2. Health Endpoints

### GET /api/health

Checks whether the API is running.

Success: 200

Response:
{
  "status": "ok",
  "service": "digital-youth-mini-app-api",
  "timestamp": "ISO-8601 timestamp"
}

### GET /api/health/db

Checks database connectivity.

In `NODE_ENV=test`, the response identifies the connected schema so test runners can verify they are not using development data.

Success: 200

Response:
{
  "status": "ok",
  "database": "connected"
}

> **Product transition:** Business diagnostic endpoints below are retained legacy APIs for data preservation; the primary Digital Youth experience now uses the method platform in section 12. Existing diagnostic records have not been removed.

## Opportunity research directory

Migration 005 creates the separate opportunity directory; migration 006 adds execution steps, review history, source review metadata and research experiment records; migration 007 seeds the three existing candidates into that directory; migration 008 adds experiment evidence and estimated/pending/received payment records; migration 009 links a received payment to its supporting evidence. Their original method records remain available and are not deleted.

Public reads:

- `GET /api/opportunities?country=IN&category=...&search=...` lists published, in-date records and exposes criterion explanations but no internal notes or unapproved sources.
- `GET /api/opportunities/:slug` returns a published detail, approved current sources and ordered steps.

Administrator writes require the active admin session and `x-csrf-token`:

- `GET /api/admin/opportunities` and `GET /api/admin/opportunities/:id`
- `POST /api/admin/opportunities`; `PATCH /api/admin/opportunities/:id`
- `POST /api/admin/opportunities/:id/sources`; `PATCH /api/admin/opportunities/:id/sources/:sourceId` edits a source and returns it to pending review; `PATCH /api/admin/opportunities/:id/sources/:sourceId/review` approves, rejects or archives it
- `PATCH /api/admin/opportunities/:id/criteria/:code`
- `PUT /api/admin/opportunities/:id/steps`
- `POST /api/admin/opportunities/:id/experiments`; `GET /api/admin/opportunities/:id/experiments`; `PATCH /api/admin/opportunities/:id/experiments/:experimentId`
- `POST /api/admin/opportunities/:id/experiments/:experimentId/evidence`; `PATCH /api/admin/opportunities/:id/experiments/:experimentId/evidence/:evidenceId/review`
- `POST /api/admin/opportunities/:id/experiments/:experimentId/payments`
- `PATCH /api/admin/opportunities/:id/publication`; `PATCH /api/admin/opportunities/:id/archive`

The qualification gate runs in a transaction. Qualification requires exactly the four expected assessments, all passing with written explanations and current approved evidence tied to the same opportunity. Publishing with an unverified qualification sets it to `under_validation`; publication never itself grants qualification.

An approved source is current through its `next_review_at` calendar date. Received research payments require a payment date, a selected `evidence_id`, and dated income evidence that is reviewed and approved on the same experiment. Estimated and pending payments may be recorded without asserting receipt. The legacy experiment income field is retained for historical compatibility but is not accepted as a new received-payment record.

## 3. Legacy Business Diagnostic Submission

### POST /api/diagnostic-submissions

Public endpoint for submitting a business diagnostic.

Content-Type: application/json

Request body:

{
  "pilotLocation": "Bengaluru",
  "participantName": "Test Participant",
  "businessName": "Example Business",
  "businessType": "Food and Beverage",
  "currentTools": ["whatsapp", "paper_records"],
  "biggestOperationalPain": "Difficulty tracking customer orders and daily business records.",
  "painFrequency": "weekly",
  "willingnessToPay": "maybe",
  "budgetAmount": null,
  "budgetCurrency": null,
  "followUpConsent": false
}

### Field validation

pilotLocation:
- Required string.
- Minimum 2 characters.
- Maximum 100 characters.

participantName:
- Required string.
- Minimum 2 characters.
- Maximum 120 characters.

businessName:
- Optional or null.
- Maximum 160 characters.

businessType:
- Required string.
- Minimum 2 characters.
- Maximum 100 characters.
- Business categories are not restricted to a fixed list.

currentTools:
- Required array.
- Between 1 and 6 entries.
- Allowed values:
  whatsapp
  paper_records
  spreadsheets
  pos_system
  none
  other
- Duplicate entries are rejected.
- "none" cannot be combined with other entries.

biggestOperationalPain:
- Required string.
- Minimum 10 characters.
- Maximum 2000 characters.

painFrequency:
Allowed values:
- daily
- weekly
- monthly
- occasionally
- unsure

willingnessToPay:
Allowed values:
- yes
- maybe
- no
- unsure

budgetAmount:
- Optional or null.
- Must be positive when provided.
- Maximum 999999999.

budgetCurrency:
- Optional or null.
- Must contain exactly three uppercase letters.
- Required when budgetAmount is provided.

followUpConsent:
- Boolean.
- Defaults to false.

contactName:
- Optional or null.
- Maximum 120 characters.

contactMethod:
Allowed values:
- whatsapp
- phone
- email

contactValue:
- Optional or null.
- Maximum 190 characters.

Follow-up consent rules:
- When consent is true, contactMethod and contactValue are required.
- Contact information is stored only when consent is true.
- When consent is false, contact information is stored as null.

### Successful response

HTTP 201

{
  "message": "Business diagnostic submitted successfully",
  "submission": {
    "id": 1,
    "submissionUuid": "generated-uuid",
    "status": "received"
  }
}

The database review status initially defaults to "new".

## 4. Admin Authentication

Administrator authentication uses database-backed accounts and server-side sessions.

### POST /api/auth/login

Authenticates an administrator using their registered email and password.

On success, the API returns administrator information and a CSRF token, and sets an HttpOnly cookie named `dy_admin_session`.

The session expires after 8 hours. Session tokens are stored as hashes in the database.

### GET /api/auth/me

Returns the authenticated administrator identity. Requires a valid session cookie.

### GET /api/auth/csrf

Rotates and returns a fresh CSRF token for the authenticated session.

### POST /api/auth/logout

Revokes the current session. Requires a valid session and CSRF token.

All `/api/admin/*` endpoints require a valid administrator session cookie.

State-changing admin requests require the `x-csrf-token` header.

Missing or invalid sessions return HTTP 401. Invalid CSRF tokens return HTTP 403.

## 5. Admin Submission Listing

### GET /api/admin/submissions

Requires an authenticated administrator session cookie.

Optional query parameters:

- page: Page number. Default 1.
- limit: Records per page. Default 20. Maximum 100.

Example:

GET /api/admin/submissions?page=1&limit=20

Successful response: HTTP 200

```json
{
  "submissions": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Results are ordered by newest creation date first.

## 6. Individual Submission

### GET /api/admin/submissions/:id

Requires an authenticated administrator session cookie.

Example:

GET /api/admin/submissions/1

Returns the complete diagnostic submission, including contact fields governed by follow-up consent.

Success: HTTP 200

Invalid ID: HTTP 400

Unknown submission: HTTP 404

## 7. Submission Status History

### GET /api/admin/submissions/:id/history

Requires an authenticated administrator session cookie.

Returns the audit history for a specific submission.

Optional query parameters:

- page: Page number. Default 1.
- limit: Records per page. Default 20. Maximum 100.

Example:

GET /api/admin/submissions/1/history?page=1&limit=20

Successful response: HTTP 200

```json
{
  "submissionId": 1,
  "history": [
    {
      "id": 1,
      "submission_id": 1,
      "previous_status": null,
      "new_status": "new",
      "changed_by": "system",
      "change_reason": "Initial status recorded",
      "changed_at": "timestamp"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

History entries are returned in chronological order.

Invalid ID: HTTP 400

Unknown submission: HTTP 404

## 8. Update Submission Status

### PATCH /api/admin/submissions/:id/status

Requires an authenticated administrator session cookie and a valid CSRF token.

Required header:

`x-csrf-token: YOUR_CSRF_TOKEN`

Content-Type: application/json

Request:

```json
{
  "status": "reviewed",
  "changeReason": "Initial review completed"
}
```

Allowed status values:

- new
- reviewed
- qualified
- not_qualified
- follow_up

The changeReason field is optional, nullable, and limited to 500 characters.

Successful status transition: HTTP 200

```json
{
  "message": "Submission status updated successfully",
  "submission": {
    "id": 1,
    "previousStatus": "new",
    "status": "reviewed"
  },
  "historyRecorded": true
}
```

When the requested status is already set, the API returns HTTP 200 with historyRecorded set to false. No duplicate audit record is created.

Status updates and their audit-history entries are saved together in a database transaction.

Invalid status or request: HTTP 400

Invalid CSRF token: HTTP 403

Invalid ID: HTTP 400

Unknown submission: HTTP 404

## 9. HTTP Error Responses

- 400 - Invalid request or validation failure.
- 401 - Missing, invalid, or expired administrator session.
- 403 - Rejected request origin or invalid CSRF token.
- 404 - Requested route or submission not found.
- 413 - Request body too large.
- 429 - Rate limit exceeded.
- 500 - Internal server error.

Validation errors may include field-level details.
## 9. Security and Infrastructure

- Helmet security headers.
- CORS origin allowlist.
- Express JSON body size limit of 25 KB.
- API rate limiting: 100 requests per 15 minutes.
- Zod request validation.
- Parameterized MySQL queries.
- Restricted MySQL application account.
- Session-based administrator authentication and CSRF protection.
- Environment-based configuration.
- No public admin listing endpoint.

Administrator authentication uses database-backed sessions, Argon2id password hashing, hashed session tokens, HttpOnly cookies, eight-hour expiry, and CSRF protection.

## 10. Database

Database: digital_youth_mini_app

Main table:
business_diagnostic_submissions

The table stores:
- Submission identifiers.
- Pilot location.
- Participant and business information.
- Existing operational tools.
- Operational pain points.
- Pain frequency.
- Willingness to pay.
- Optional budget information.
- Follow-up consent.
- Consent-controlled contact information.
- Submission review status.
- Creation and update timestamps.

## 11. Legacy Frontend Integration

Participant frontend:
- Use POST /api/diagnostic-submissions.
- Use GET /api/health for API health checks.
- Do not require admin credentials.

Legacy admin submission functionality:
- Requires protected server-side authentication.
- Never expose administrator passwords or session tokens in public frontend code.
- The corrected method-research interface uses the existing protected session APIs and the methods endpoints in section 12.

Development frontend origin:
http://localhost:5173

Backend:
http://localhost:4000

## 12. Independent Income Methods

The current Digital Youth product uses method records and project validation experiments. Public visitors need no account. Personal checklist progress remains in browser-local storage and is not sent to this API by default.

### Method states and qualification gate

Method status is `draft`, `under_validation`, `qualified`, `rejected`, or `archived`. Only published, non-archived records in disclosed states are returned publicly. Qualification assessments use `pass`, `conditional`, `fail`, or `not_verified` and require an explanation. The four criterion codes are:

- `phone_and_free_tools`
- `independent_execution`
- `no_credentials_or_preexisting_trust`
- `no_meetings_or_sales_calls`

An administrator cannot set a method to `qualified` unless exactly four criteria are present, all are `pass`, and each links to at least one approved evidence source for that method. Changing criteria or sources that invalidate this gate automatically unpublishes and returns the method to `under_validation`.

The method editor saves method content, all four assessments, steps, tools and source references together using `PUT /api/admin/methods/:id/research`. This combined write is transactional. A database error rolls back the whole edit. Individual `/criteria`, `/steps`, `/tools`, and `/sources` writes remain available for integrations and apply their own transactional validation.

### Public reads

`GET /api/methods` accepts optional exact `category` and `status` filters. Public status values are `under_validation`, `qualified`, and `rejected`. It returns published methods and four criterion status indicators. Draft and private records are excluded.

`GET /api/methods/:slug` returns public method content, assessments and explanations, execution steps, tools, and approved evidence sources. Administrative fields and unapproved sources are excluded.

`GET /api/methods/:slug/experiments` returns only administrator-approved, completed project-validation records and approved evidence items. Actual income fields are actual recorded amounts, not estimates. Public approval requires at least one approved evidence item.

Public method responses use a stable envelope: `{ method, criteria, steps, tools, sources }`. Public method and experiment reads have a short bounded cache lifetime. Authentication and administrator responses are marked private and non-cacheable.

Unknown or unpublished slugs return 404. These reads are public and do not require an administrator session.

### Administrator method endpoints

All `/api/admin/methods` endpoints require the existing HttpOnly admin session. POST, PATCH and PUT requests also require `x-csrf-token`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/methods?page=1&limit=20` | Paginated methods and content-quality indicators |
| POST | `/api/admin/methods` | Create a draft method |
| GET | `/api/admin/methods/:id` | Retrieve complete method, criteria, steps, tools and sources |
| PATCH | `/api/admin/methods/:id` | Update method text and metadata |
| PATCH | `/api/admin/methods/:id/status` | Set review status and publication state, subject to qualification gate |
| PUT | `/api/admin/methods/:id/criteria` | Replace all four qualification assessments |
| PUT | `/api/admin/methods/:id/steps` | Replace ordered execution steps |
| PUT | `/api/admin/methods/:id/tools` | Replace tool requirements |
| PUT | `/api/admin/methods/:id/sources` | Update/replace sources while preserving submitted source IDs |

Create method body:

```json
{
  "slug": "example-method",
  "title": "Example method",
  "category": "Digital products",
  "summary": "A concise description of the candidate.",
  "overview": "What the individual actually does.",
  "distribution": "How output may reach people and what remains unknown.",
  "incomeMechanism": "Potential transaction mechanism and eligibility limitations.",
  "requirements": {"device": "Not verified", "internet": "Not verified"},
  "limitations": "Known risks and unverified requirements."
}
```

Criteria body:

```json
{"criteria":[
  {"code":"phone_and_free_tools","assessment":"not_verified","explanation":"Evidence summary.","sourceIds":[]},
  {"code":"independent_execution","assessment":"not_verified","explanation":"Evidence summary.","sourceIds":[]},
  {"code":"no_credentials_or_preexisting_trust","assessment":"not_verified","explanation":"Evidence summary.","sourceIds":[]},
  {"code":"no_meetings_or_sales_calls","assessment":"not_verified","explanation":"Evidence summary.","sourceIds":[]}
]}
```

The `steps`, `tools`, and `sources` PUT bodies use `{ "items": [...] }`. Step fields are `stepNumber`, `title`, `whatToDo`, `howToDo`, `toolNames`, `output`, `successLooksLike`, `commonProblems`, and `alternatives`. Tool fields are `name`, `purpose`, `officialUrl`, `freeConditions`, `limitations`, `phoneUsable` (`yes`, `limited`, `no`, `not_verified`) and `lastVerified`. Source fields are `title`, `url`, `sourceType`, `accessedAt`, `lastVerifiedAt`, `supportsClaim`, `supportsArea`, and `approved`. A source may include its existing numeric `id`; omitted IDs are created and existing IDs omitted from the submitted list are removed. The response returns saved IDs.

### Administrator project-validation experiments

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/experiments` | List project validation experiments |
| POST | `/api/admin/experiments` | Create an internal experiment and evidence records |
| GET | `/api/admin/experiments/:id` | Retrieve experiment and evidence |
| PATCH | `/api/admin/experiments/:id` | Update experiment status, execution, results, approvals and evidence |

All writes require `x-csrf-token`. Experiment statuses: `planned`, `in_progress`, `completed`, `paused`, `rejected`. Fields include `methodId`, `title`, `hypothesis`, `owner`, dates, tools, initial cost, actual spending, actual income, tasks, outputs, problems, final assessment, public approval and optional evidence. Evidence fields are `title`, `url`, `description`, `evidenceType`, `recordedOn`, and `publicApproved`. Amounts are nullable non-negative numbers, and each supplied amount requires its matching uppercase three-letter currency field (`initialCostCurrency`, `actualSpendingCurrency`, or `actualIncomeCurrency`). No estimate is treated as actual income. Public approval is limited to completed experiments with at least one approved evidence item.

### Migration and data preservation

Migration `004_income_methods.sql` adds method, assessment, step, tool, source, project-experiment and evidence tables. Migrations 001–003 and existing diagnostic data remain intact. Run migrations separately against the intended development database and the isolated `digital_youth_mini_app_test` database. No migration is reported as applied unless the database connection succeeds.
