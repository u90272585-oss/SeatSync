# SeatSync

SeatSync is a university prototype for reserving tables at cafés and restaurants.
The site combines Darina's homepage, Uldana's booking/confirmation flow and Malika's
administrator dashboard. Existing designs are retained.

**Backend version:** Node.js + Express + SQLite. The server serves both the website
and its API. Reservations now persist in a shared database, rather than localStorage.
No real payment is taken and no reservation is sent to a real restaurant.

## Run locally

Use Node.js **24.14 or a newer 24.x release**. From this repository folder:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:3000/**. Keep the server terminal open. Stop it with Ctrl+C.
Do not use `python3 -m http.server` for this version: it cannot run the booking API.
Port 3000 avoids the previous frontend server on port 8000.

The SQLite file is created automatically at `data/seatsync.sqlite`. Keep that folder
when restarting: it contains accounts, sessions and reservations. It is excluded
from Git. Node 24 may print an experimental SQLite warning; this is not a startup error.

If port 3000 is occupied, use `PORT=3001 npm start` and open port 3001.

### Administrator access

In a second terminal, in the same project folder:

```sh
npm run admin:create
```

Enter an email, name and password of 10–128 characters. Password input is visible
in this terminal: create the account before presenting or screen sharing. The
password is stored as a salted scrypt hash, not plain text. Do not commit credentials.
There is no default administrator account or public admin registration option.

Open `/pages/account.html` and sign in with that account. It opens Malika's dashboard
at `/admin.dashbroad.html`. A customer account cannot grant itself admin permissions.
To test a customer at the same time, use another browser or private window.

### Guest and customer access

- A guest can book without an account. A server-issued HttpOnly cookie grants access
  to that guest's bookings. Losing that cookie loses guest access, not the database row.
- Register or sign in in the same browser to attach its guest bookings to your account.
- A signed-in customer can see their bookings in another browser after signing in.
- Administrators see all prototype bookings and can create, edit and cancel them.
- Old frontend-only records are **not imported automatically**. They have no verified
  owner. Existing localStorage data is left untouched; create a new server booking.
- Only unfinished form drafts remain in localStorage. Confirmation uses an ID to read
  the saved booking from the server; query-string fields cannot manufacture a booking.

## What works

Choose venue → date/time → guests → available table → accept demo terms → confirm.
The API validates inputs again and creates the reservation inside a SQLite transaction.
A 90-minute visit cannot overlap another active booking at the same venue/table.
An adjacent visit starting at the previous visit's end is allowed.

Editing keeps the same booking ID. A version check rejects stale edits from another
page. Cancellation changes status to `cancelled`, preserves history, and frees the
slot. Cancelled or already-started bookings cannot be edited; started bookings cannot
be cancelled. Almaty time is used regardless of device timezone.

Confirmation, My bookings and the admin dashboard refresh every five seconds while
visible, and on window focus. This is polling, not a WebSocket/live-chat service.
The admin table, filters, metrics, floor plan and modal retain Malika's existing UI.

## Code map

| File | Responsibility |
| --- | --- |
| `server/index.cjs` | Opens database and starts the HTTP server |
| `server/app.cjs` | API routes, access checks, transactions and conflict checks |
| `server/database.cjs` | Schema and initial venue/table catalogue |
| `server/auth.cjs` | Salted password hashing and verification |
| `server/create-admin.cjs` | Local administrator creation |
| `js/api.js` | Browser HTTP requests and initial server session |
| `js/booking-storage.js` | Async booking API adapter and temporary render cache |
| `js/booking-rules.js` | Validation shared between browser and Node |
| `js/booking.js` | Form, server availability, create/edit submission |
| `js/confirmation.js` | Load receipt by ID and confirm cancellation |
| `js/account.js` | Registration/login, profile and My bookings |
| `js/admin-bookings.js` | Connect server records to Malika's existing components |

## API

All mutations use JSON and the header `X-SeatSync-Request: 1`.
Requests share the website origin and use the session cookie; CORS is not enabled.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Server/database health |
| `GET /api/session` | Current customer/admin or anonymous session |
| `POST /api/auth/register` | Create a customer account |
| `POST /api/auth/login`, `POST /api/auth/logout` | Start/end authenticated access |
| `PATCH /api/profile` | Update the current user's name |
| `GET /api/venues` | Database venue catalogue |
| `GET /api/availability?venue=skyberry&date=YYYY-MM-DD&time=14:00` | Table availability |
| `GET /api/bookings` | Session-authorized bookings; all for admin |
| `GET /api/bookings/:id` | Authorized booking details |
| `POST /api/bookings` | Create `{venue,date,time,guests,table}` |
| `PUT /api/bookings/:id` | Edit those fields, including current `version` |
| `POST /api/bookings/:id/cancel` | Cancel a future booking |

Admin creation also accepts a customer `name`. Booking IDs and ownership are assigned
by the server. Unauthorized booking IDs return 404; invalid data returns 400; occupied
slots, stale edits and invalid status transitions return 409. SQL uses bound parameters.
Database, environment files and server sources are not served as website assets.

## Tests and demonstration

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Alternatively, on macOS with Google Chrome installed:

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

Tests use isolated databases and browser contexts; they do not alter local demo data.
API tests cover persistence after restart, simultaneous conflicts, ownership, admin
access, validation, session login/logout, and static-file isolation. Browser checks
cover booking, editing, cancellation, cross-browser admin updates, registration,
cross-browser customer login and mobile widths. Browser tests need network access for
the admin's existing external Tailwind/icons/fonts.

For defense: open homepage → create a future guest booking → show it in an admin
browser → edit/cancel → show both views update → restart the server → show history
remains. Explain the request, server validation, SQL write and response. See
[the Russian walkthrough](docs/BACKEND-GUIDE-RU.md).

## Deployment status and configuration

**Not deployed yet. No public URL has been created by this change.** Localhost only
works while this computer runs the server. A public live deployment remains a
separate midterm requirement.

Use a Node 24 host with HTTPS, a **persistent writable disk**, and one server instance
for this SQLite prototype. Build with `npm ci --omit=dev`; run `npm start`. Set:

- `HOST=0.0.0.0`
- `PORT` to the host-provided port
- `DATABASE_PATH` to a file on the persistent disk (for example `/var/data/seatsync.sqlite`)
- `NODE_ENV=production` behind the host's HTTPS reverse proxy (one trusted proxy hop)

Production cookies are Secure and require HTTPS. Configure proxy trust for the actual
host topology before publishing. An ephemeral filesystem or multiple independent
instances would lose/split data. Static-only hosting such as GitHub Pages cannot run
this API. No hosting purchase or deployment has been made. Add the real public URL
here after deployment and verify it from another device.

`.env.example` documents configuration. Environment variables are read from the
process; copying it to `.env` alone does not load it. For a local env file use
`node --env-file=.env server/index.cjs` and the same environment for admin creation.
To back up the database safely, stop the server and copy the entire `data` directory.
For production, use the host's persistent-disk backups and test restoration.

## Scope and team history

Darina: original homepage. Malika: original administrator UI. Uldana: booking,
confirmation, cancellation and their frontend integration. Backend changes are kept
on a separate local branch; do not attribute commits to another team member. Each
member must make and explain their own meaningful contributions.

[Stage 2 documentation](docs/STAGE2-HISTORY.md) preserves the previous frontend-only
behavior and history. It is historical; its Python/localStorage instructions do not
apply to this backend version.

The Almaty venue names come from the team's supplied references. Opening hours, table
plans and capacities are illustrative. The generated atmosphere images are not actual
interior photographs. Service fees and cancellation terms are prototype examples;
there are no payments, emails, venue integrations or live support chat. Account email
verification/password recovery, production monitoring and multi-instance database
operation are outside this implementation. Admin's existing CDN styles/icons still
need internet access; the backend does not redesign them.
