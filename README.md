# Fraud Response Tracker

> **CodeSprint-2026-Falcons.** — lets cook.

A mobile-first reporting and case-tracking MVP for people affected by online fraud. It combines guided intake, secure evidence handling, duplicate hints, a transparent status timeline, officer review tools, and immediate safety guidance.

> **Important:** This is an independent guidance and tracking service, not a government or law-enforcement authority. It does not file a report with a bank or the National Cyber Crime Reporting Portal. If money was just transferred in India, call **1930** and contact the bank immediately. Submit an official report at [cybercrime.gov.in](https://cybercrime.gov.in/).

## Architecture

- **Client:** React 18 + Vite, Tailwind CSS, React Router, TanStack React Query, Recharts and react-i18next. The UI is responsive and includes English/Hindi resources.
- **API:** Express REST API under `/api/v1`, with Zod validation, JWT sessions, OTP rate limits, role-based middleware, safe text handling, and a consistent `{ data }` / `{ error }` response shape.
- **Data:** PostgreSQL via Prisma. Complaint status history, notification records, suspect identifiers, evidence metadata, OTP sessions and officer audit events are separate records.
- **Evidence:** Multer enforces an image/PDF allowlist, 5 MB per file and file-signature checks. Set `CLOUDINARY_URL` to use authenticated Cloudinary storage; without it, files are stored locally for development. Local uploads are rejected in production.
- **Messaging:** Nodemailer email and an SMS service interface. OTP uses `123456` in development when `OTP_MOCK=true`; Twilio REST delivery is enabled when mock mode is disabled and Twilio credentials are configured.
- **AI:** Optional server-side Claude calls support type suggestions and short safety explanations. Classification and scam checks have local heuristic fallbacks. No AI key is required to run the core app.

### Main folders

```text
client/
  src/pages/          Citizen, officer and admin screens
  src/components/     Shared UI and help-chat widget
  src/i18n.js         English and Hindi UI resources
server/
  prisma/schema.prisma
  prisma/seed.js
  src/routes/         Versioned REST API route handlers
  src/services/       SMS, email, evidence storage and AI adapters
```

## Requirements

- Node.js 20 or newer and npm 10 or newer
- PostgreSQL 14 or newer
- Optional: Cloudinary account, Twilio account, SMTP service and Anthropic API key

## Setup

From the project root:

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create the server environment file and set a secure JWT secret:

   ```sh
   cp .env.example server/.env
   ```

   Set `DATABASE_URL` to a PostgreSQL database you control. Replace `JWT_SECRET` with a random value of at least 32 characters. Keep `.env` files private.

3. Generate the Prisma client, apply the schema, and load demo data:

   ```sh
   npm run db:generate
   npm run db:migrate -- --name init
   npm run db:seed
   ```

4. Start both apps:

   ```sh
   npm run dev
   ```

   The web app is at `http://localhost:5173`, the API at `http://localhost:4000`, and the health check at `http://localhost:4000/health`.

The client uses `http://localhost:4000/api/v1` by default. To change it, set `VITE_API_URL` in `client/.env`.

When `DATABASE_URL` is blank in development, auth and complaint workflows use a local demo store at `server/.local-dev-data.json` so OTP sign-in and case submission can be tried without PostgreSQL. This file is private to the local workspace, excluded from Git, and is not suitable for production or shared hosting. To clear demo cases, stop the API and remove that specific file.

## Demo accounts

The seed creates a victim, officer, administrator and 15 sample complaints. In development, use OTP `123456` for any seeded phone:

| Role | Phone |
| --- | --- |
| Victim | `+919000000001` |
| Officer | `+919000000002` |
| Admin | `+919000000003` |

Use the victim account to report and track a case; the officer account to review the queue; and the admin account to view analytics and add officers.

## API overview

- `POST /api/v1/auth/send-otp`, `POST /api/v1/auth/verify-otp`
- `POST /api/v1/complaints`, `GET /api/v1/complaints`, `GET /api/v1/complaints/:id`
- `POST /api/v1/complaints/check-duplicates`, `POST /api/v1/complaints/:id/add-details`, `POST /api/v1/complaints/:id/evidence`
- `GET /api/v1/complaints/evidence/:evidenceId/file` (authenticated, ownership checked)
- `GET /api/v1/officer/complaints`, `PATCH /api/v1/officer/complaints/:id/status`
- `POST /api/v1/officer/complaints/:id/notes`, `POST /api/v1/officer/complaints/:id/request-evidence`
- `GET /api/v1/admin/analytics`, `GET /api/v1/admin/officers`, `POST /api/v1/admin/officers`
- `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`
- `POST /api/v1/tools/classify`, `POST /api/v1/tools/scam-check`, `POST /api/v1/tools/chat`

## Assumptions and production follow-up

- OTP mock mode is for local development only. Production requires HTTPS, a valid Twilio configuration, a high-entropy secret, SMTP, PostgreSQL backups and Cloudinary (or another private object store).
- Case IDs are sequential per year; the database sequence row is updated transactionally.
- Duplicate prompts only reveal a person's own existing complaints. Normalized suspect identifiers are stored separately and can connect cases for authorized officers, but cross-user case details are never returned to a victim.
- Incident descriptions and evidence are sensitive. This MVP restricts evidence reads through authenticated API access, but production deployment should add database/object-store encryption policies, retention and deletion workflows, malware scanning, stronger content inspection, audit-log retention controls, and privacy/legal review.
- The upload adapter uses Cloudinary authenticated resources when configured. Local disk storage is a development fallback and is not suitable for a horizontally scaled or ephemeral production host.
- Analytics are operational counts, not predictions or guarantees of recovery. The optional assistant is informational and never has access to other users' case records.
# CodeSprint-2026-final
