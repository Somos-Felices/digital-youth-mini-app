# Local Digital / Digital Youth

This repository contains the mobile-first Local Digital business-visit diagnostic and the existing Digital Youth backend/admin platform. The active public frontend is a React 19, Vite, TypeScript and React Router single-page app. Bahasa Indonesia is the default language; English is available in the header.

## Active field-visit flow

The public diagnostic has five input steps: business name/type, current tools, operational pain, problem areas, and optional WhatsApp contact with explicit follow-up consent. It does not ask about pricing or willingness to pay. Drafts and completed visits are stored in IndexedDB. When the API URL is not configured, the confirmation says the visit has not reached the team. When the API URL is configured, the frontend queues an idempotent local copy and submits to the versioned endpoint. A server-confirmed message appears only after an acknowledged response. Failed sends remain on the device for manual retry; there is no background sync.

The service worker caches the application shell and same-origin assets after first use. This supports offline reopening after the app has been loaded online. IndexedDB persistence and offline page loading are separate behaviors; run the preview browser check to verify both.

## Frontend development

Use Node.js 20+. In `frontend/`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

The app runs at `http://localhost:5173`. Set `VITE_API_BASE_URL` to the API origin (for local development, `http://localhost:4000`). An empty or unset value keeps the form in explicit local-only mode. This variable is a public API origin, never a secret.

```powershell
npm run typecheck
npm run build
npm run preview
```

The production build is written to `frontend/dist`. The preview uses port 5173, as does the development server, so stop one before starting the other.

## Backend and database

In `backend/`, copy `.env.example` to `.env` and configure the restricted application user and separate migration user for the intended MySQL 8 database. Keep credentials out of source control. The API runs on port 4000 and exposes `GET /api/health` and `GET /api/health/db`.

The legacy `POST /api/diagnostic-submissions` route and its historical table remain unchanged. The active form uses `POST /api/v2/field-visit-diagnostics`, backed by the additive `field_visit_diagnostic_submissions` table. The v2 contract and field compatibility matrix are documented in [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md).

After confirming the target database is the intended development database, apply additive migrations with:

```powershell
npm run db:migrate
```

The integration test environment must point only to `digital_youth_mini_app_test`. It applies no migrations by itself; use the migration runner with the test database configured before running the test suite:

```powershell
$env:MIGRATION_DB_NAME = 'digital_youth_mini_app_test'
npm run db:migrate
Remove-Item Env:MIGRATION_DB_NAME
npm test
```

The integration suite verifies the selected database before cleaning only its known test fixtures. Do not run its cleanup against development data.

The browser-to-MySQL acceptance test uses the isolated `backend/.env.test` configuration and `digital_youth_mini_app_test`; it refuses other databases. In `backend/`, start the API on port 4001 with:

```powershell
node -e "require('dotenv').config({path:'.env.test',override:true}); process.env.PORT='4001'; require('./dist/server.js')"
```

Then run `node scripts/field-visit-e2e.test.cjs` from the repository root. This test requires installed Chrome, independently verifies two fictional submissions and both consent states, tests a failed request and idempotent retry, then deletes only the two exact generated submission UUIDs from the test database. It never writes to the shared development database.

## Browser QA

The focused Playwright test starts its own Vite server on port 5173 and uses installed Chrome when available. Stop other dev/preview servers first. To test the local-only flow:

```powershell
npm run test:e2e
```

To verify offline shell caching and offline IndexedDB saves against the production preview, build with the API unset for the local-only scenario, stop other servers on 5173, start `npm run preview`, then run:

```powershell
npm run build
$env:TEST_PREVIEW = '1'
npm run test:e2e
Remove-Item Env:TEST_PREVIEW
```

Screenshots are written to `test-screenshots/local-digital-redesign-mobile.png` and `test-screenshots/local-digital-redesign-desktop.png`.

The former `scripts/local-browser-e2e.cjs`, `scripts/verify-mvp.cjs`, and `scripts/verify-visit-experience.cjs` target older Next.js and multi-page experiences. They are legacy checks and are not the active Vite browser suite. The original backend methods/opportunities endpoints and admin routes remain available, but are not part of the public five-step field visit.

## Deployment preparation (not a deployment instruction)

For Vercel, set the project root to `frontend`, use `npm run build`, and publish `dist`. `frontend/vercel.json` provides the React Router fallback. Configure `VITE_API_BASE_URL` to a publicly reachable HTTPS backend origin and set the backend's `CORS_ORIGINS` to the exact deployed frontend origin (no trailing slash). Production session cookies use `Secure`, `HttpOnly`, and `SameSite=None` so credentialed requests can work across the frontend/API origins; browsers may still block third-party cookies across unrelated domains, so use custom domains under the same site or a same-origin API proxy. A phone cannot reach a developer's `localhost`; remote submissions require the backend to be hosted and reachable over HTTPS. No deployment has been performed.

## Security notes

The browser never connects to MySQL. V2 submissions use server-side Zod validation, parameterized SQL, an API rate limit, a UUID idempotency key, a unique database index, and a payload digest to reject changed content under a reused key. Contact values are stripped client-side without consent, rejected server-side without consent, and protected by a database check constraint. The application API user has no schema-alter privilege; migrations use a separate account.
