# Digital Youth Mini-App — API Documentation

Version: 1.0
Date: 2026-11-03
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

Success: 200

Response:
{
  "status": "ok",
  "database": "connected"
}

## 3. Business Diagnostic Submission

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

## 11. Frontend Integration

Participant frontend:
- Use POST /api/diagnostic-submissions.
- Use GET /api/health for API health checks.
- Do not require admin credentials.

Admin functionality:
- Requires protected server-side authentication.
- Never expose administrator passwords or session tokens in public frontend code.
- Admin interface integration must use a secure server-side authentication layer.

Development frontend origin:
http://localhost:5173

Backend:
http://localhost:4000
