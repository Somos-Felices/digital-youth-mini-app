# Digital Youth — Independent Digital Income

Digital Youth helps a young person explore practical digital income methods they can investigate and test independently with a phone and accessible tools. The platform documents requirements, distribution, costs, risks and actual evidence; it does not promise earnings.

## Product principles

Every candidate method is assessed against four requirements:

1. Start with a phone and free or clearly costed tools.
2. Execute independently without Somos Felices or its resources.
3. Start without professional credentials or pre-existing trust, while disclosing identity and eligibility requirements.
4. Operate without meetings or sales calls.

Each criterion has a `pass`, `conditional`, `fail` or `not_verified` result and a written explanation. A method may only be qualified when all four pass and each links to an approved evidence source. Initial method records are marked **under validation** and contain no experiment or earning claims.

Personal visitor experiment progress (checklist, time, costs, outputs, actual received income and notes) is stored in that visitor’s browser. It is not uploaded to the API by default.

## Technology and structure

- `frontend/`: Next.js App Router, React, TypeScript and Tailwind CSS.
- `backend/`: Express 5, TypeScript, Zod and MySQL.
- `docs/migrations/`: append-only SQL migrations. Migrations 001–003 are retained; migration 004 adds method research and project experiment tables without deleting diagnostic records.
- Admin authentication keeps the existing Argon2id, HttpOnly session cookie and CSRF-protected session flow.

The previous business diagnostic API, schema and records remain in place for data preservation, but are no longer part of the main visitor experience.

## Backend setup

Use Node.js 20+ and MySQL 8+. In `backend/`:

```powershell
npm install
Copy-Item .env.example .env
```

Set the database and migration credentials in `backend/.env`. Keep secrets out of source control. Apply migrations additively to the intended development database:

```powershell
npm run db:migrate
```

For integration tests, configure `backend/.env.test` to use only `digital_youth_mini_app_test`, apply the migration runner with that isolated database configuration, and then run the tests. Never run test cleanup against the development database.

Run the API on port 4000:

```powershell
npm run dev
```

## Frontend setup

In `frontend/`, install dependencies and copy the environment example:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The frontend runs at `http://localhost:5173` and uses `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`. Ensure backend `CORS_ORIGINS` permits `http://localhost:5173`. Admin browser requests use credentialed fetches; do not expose the HttpOnly session cookie to JavaScript.

For production, set `NEXT_PUBLIC_API_BASE_URL` to the HTTPS API origin at build time; the Next.js bundle embeds this public endpoint. Set backend `CORS_ORIGINS` to the exact HTTPS website origin(s), without a path or trailing slash. Because administrator cookies use `SameSite=Lax`, deploy the web app and API on the same site (for example, sibling HTTPS subdomains) and verify that the browser accepts the API cookie. Do not use localhost fallbacks in a production build.

## Routes

Public: `/`, `/approach`, `/methods`, `/methods/[slug]`, `/my-experiments`.

Administrator: `/admin/login`, `/admin`, `/admin/methods`, `/admin/methods/new`, `/admin/methods/[id]`, `/admin/experiments`.

## API overview

Public method reads:

- `GET /api/methods` (optional `status` and `category` filters)
- `GET /api/methods/:slug`
- `GET /api/methods/:slug/experiments` (approved records only)

Protected administrator methods and project experiments are documented in [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md). Every administrator mutation requires the existing session cookie and `x-csrf-token`. The browser never connects to MySQL.

## Checks

From `backend/`: `npm run typecheck`, `npm run build`, `npm run test:unit`, and `npm run test:integration` (requires the isolated test database).

From `frontend/`: `npm run typecheck` and `npm run build`. Linting is not currently configured.

Production starts use `npm start` from `backend/` and `npm start` from `frontend/`, after setting production database, API URL and exact HTTPS CORS origins. Confirm the built frontend has the intended API URL before release.

Never report a test, migration or build as successful unless it was actually run. The seed candidate methods deliberately show unknowns and no fabricated results.
