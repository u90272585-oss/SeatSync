# SeatSync

SeatSync is a university table-reservation prototype. It combines Darina's homepage,
Uldana's booking/confirmation flow and Malika's administrator dashboard.

**Backend: Python + Flask + SQLite.** Waitress serves the Flask application and the
existing HTML/CSS/JavaScript frontend. Node.js is not required to run the website.
It is optional tooling for the JavaScript and browser tests only.

## Run locally

Use Python 3.11 or newer. In the project folder, first-time setup:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:3000/** and keep the terminal open. Stop with Ctrl+C.
For subsequent starts, just activate the environment and start the app:

```sh
source .venv/bin/activate
python app.py
```

Do not use `python3 -m http.server`: it only serves files and cannot run the API.
If port 3000 is occupied, use `PORT=3001 python app.py` and open port 3001.

The database is created automatically at `data/seatsync.sqlite`. Keep this directory:
it contains accounts, sessions and reservations. It is excluded from Git.

### Create an administrator

In a second terminal, in the same project folder:

```sh
source .venv/bin/activate
python -m server.create_admin
```

Enter email, name and a password of 10–128 characters. Password input is hidden.
Then sign in at `/pages/account.html`; administrators open `/admin.dashbroad.html`.
There are no default admin credentials, public admin signup or browser role switches.
Existing administrator accounts continue to work after the Python migration.

### Browsing and customer accounts

Restaurants, menus, search, categories, device favorites are public.
To book, a visitor registers or signs in first. The chosen venue/date/time is preserved
through authentication. The API rejects anonymous creation, editing and cancellation.
Existing guest bookings from earlier versions can still be attached to an account by
signing in from their original browser. No existing records are deleted.
Customers see their own reservations across browsers; only database-assigned admins
can manage all bookings. Passwords are salted scrypt hashes.

## Booking behavior

Choose venue → register/sign in → date/time → guests → table → accept demo terms → confirm.
The backend independently checks all submitted fields and saves inside a SQLite
transaction. A 90-minute visit cannot overlap another active booking at the same
venue/table. An adjacent visit starting at the previous visit's end is allowed.

Editing retains the ID. A `version` check rejects edits based on outdated data.
Cancellation changes status to `cancelled`, preserves history and frees the table.
Cancelled or already-started bookings cannot be edited. Started bookings cannot
be cancelled. All booking times use `Asia/Almaty`, regardless of device timezone.

Confirmation, My bookings and the admin dashboard poll the API every five seconds
while visible, and on focus. They retain the existing designs. There is no WebSocket
or live support chat. Unfinished form drafts and device favorites remain in localStorage; bookings stay in SQLite.

## Demo payments (Halyk ePay test + simulated Kaspi/card)

Every customer booking also gets a `payments` row (`pending`, 100 KZT, 10-minute hold).
The `bookings` table is unchanged; payments live in a separate table so the booking
state machine stays `confirmed`/`cancelled`. Admin-created bookings need no payment.

The 10-minute hold is enforced server-side: `payments.sweep()` runs in a
`before_request` hook on every `/api/*` call (except `/api/health`). When
`expires_at` passes, the payment becomes `expired` **and** the booking becomes
`cancelled`, which frees the table. Closing the tab does not bypass the sweep.

Endpoints:

- `GET /api/bookings/:id/payment` — `{payment: {status, method, amount, currency, secondsLeft} | null}`.
- `POST /api/bookings/:id/payment/pay` — **demo only**, body `{method: 'kaspi'|'card', outcome: 'success'|'failure'|'expire'}`.
  `failure` returns HTTP 402 and changes nothing (retry within the hold); `expire` marks expired and cancels the booking;
  `success` is idempotent; a finished payment returns 409. The client trusts the chosen outcome — acceptable **only**
  because it is a simulation, and no real money moves.
- `POST /api/bookings/:id/payment/halyk/start` — gets an OAuth token from Halyk ePay **TEST** and returns
  `{script, payment}` (the browser script URL and `halyk.pay()` params). The client secret stays on the server.
- `POST /api/bookings/:id/payment/halyk/verify` — the server asks Halyk's check-status API and marks the payment
  `paid` only if `resultCode == '100'`, `statusName in ('CHARGE','AUTH')`, and the invoice ID and amount match.
  Returns 202 `{result:'processing'}` for codes 102/107 or NEW/FINGERPRINT; 402 otherwise; 409 if the hold already expired.

Halyk runs in the bank's **sandbox** (`https://test-epay.epayment.kz`), not in production.
Test cards are on the [Test credentials page](https://epayment.kz/docs/Test-credentials)
(use a card with status *unlock*). Sandbox credentials are public in the docs and are the
code defaults; they can be overridden with environment variables:

- `HALYK_CLIENT_ID`, `HALYK_CLIENT_SECRET`, `HALYK_TERMINAL_ID`
- `HALYK_OAUTH_URL`, `HALYK_STATUS_URL`, `HALYK_SCRIPT_URL`

**Kaspi and bank-card forms are visual simulations.** Kaspi has no public free sandbox;
the card form is a demo. No real money moves and nothing is charged to a real card.
The page says so and is not affiliated with Kaspi.kz.

**Why postlink is not used locally.** Halyk's server callback (postlink) cannot reach
`127.0.0.1`, so the design does not depend on it. A dummy postLink URL is sent because
the token request requires the field, but verification happens **after** the bank
redirects the user back, by calling Halyk's status API server-to-server. This is why
the Halyk path is the only one that cannot be spoofed from the browser.

**What a real integration needs.** A registered ИП/ТОО, a signed contract with the bank,
production keys, and a public HTTPS URL for postlink/webhook. Late payments after the
10-minute hold would need a refund path — not implemented here.

## Integrated administration

The shared dashboard retains Malika's layout and adds working venue/date/status/search
filters, reservation creation for a registered customer email, edit/cancel, CSV download,
active-booking notifications, date selection and per-venue table block/capacity controls.
The dashboard metrics describe the selected venue/date; the floor plan uses the selected
time. Export includes all bookings visible to the administrator.

Table overrides are stored in `venue_tables`, created automatically without changing
existing reservations. Blocking a table or reducing its capacity is rejected if it conflicts
with an upcoming or ongoing booking. Settings and reservations use the same SQLite
write lock. Defaults (including unavailable tables 7–8) apply until an admin overrides them.
Booking statuses are consistently `confirmed` and `cancelled`; there is no pending-approval
workflow. Visits last 90 minutes. A cancelled booking is retained for history.

## Python code map

| File | Responsibility |
| --- | --- |
| `app.py` | Start the Python HTTP server |
| `server/app.py` | Flask routes, sessions, access checks and booking operations |
| `server/database.py` | SQLite connection, initialization and transactions |
| `server/schema.sql` | SQL tables and indexes |
| `server/rules.py` | Server-side input validation and Almaty time |
| `server/auth.py` | Password hashing and verification |
| `server/payments.py` | Demo payments: 10-minute hold, Halyk ePay test, sweep |
| `server/create_admin.py` | Create an admin locally |
| `server/catalog.json` | Initial venue/table catalogue |
| `js/api.js` | Browser requests to the Python API |
| `js/booking-storage.js` | Async API adapter; memory cache for rendering only |
| `js/booking.js`, `js/confirmation.js` | Booking, editing and cancellation interface |
| `js/account.js`, `js/admin-bookings.js` | Account screens and Malika's dashboard |

Python validates independently of the browser. The catalogue matches `js/venues.js`
and the tables in `js/booking-rules.js`; update both when changing the catalogue.
An automated JavaScript test checks this contract. SQL uses parameter binding.

## API

Mutation requests use JSON, the header `X-SeatSync-Request: 1` and the session cookie.
The API shares the website origin. Cross-origin writes are rejected; CORS is disabled.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Database/server health, identifies Python backend |
| `GET /api/session` | Current user or anonymous session |
| `POST /api/auth/register` | Customer registration |
| `POST /api/auth/login`, `POST /api/auth/logout` | Authentication |
| `PATCH /api/profile` | Update your name |
| `GET /api/venues` | Database venue catalogue |
| `GET /api/availability?venue=skyberry&date=YYYY-MM-DD&time=14:00` | Table availability |
| `GET /api/bookings` | Authorized bookings (all for admin) |
| `GET /api/bookings/:id` | Authorized booking details |
| `POST /api/bookings` | Signed-in creation `{venue,date,time,guests,table}`; admins may supply `customer_email` |
| `PUT /api/bookings/:id` | Edit those fields, with current `version` |
| `POST /api/bookings/:id/cancel` | Cancel a future booking |
| `GET /api/bookings/:id/payment` | Payment status for one booking (`null` if none) |
| `POST /api/bookings/:id/payment/pay` | **Demo only:** `{method:'kaspi'\|'card', outcome:'success'\|'failure'\|'expire'}` |
| `POST /api/bookings/:id/payment/halyk/start` | Halyk ePay TEST: server gets an OAuth token, returns `{script, payment}` |
| `POST /api/bookings/:id/payment/halyk/verify` | Halyk ePay TEST: server verifies invoice via status API |

| `GET /api/admin/tables?venue=skyberry` | Administrator: current venue tables |
| `PATCH /api/admin/tables/:venue/:table` | Administrator: `{blocked,seats}` |
| `GET /api/admin/bookings/export` | Administrator: CSV attachment |

Server-generated IDs and ownership cannot be set by a customer. Unauthorized IDs
return 404, invalid input returns 400, occupied slots/stale edits return 409.
Only public frontend folders/files are served; database and Python code are private.

## Tests

Backend tests need only Python dependencies:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
```

Optional frontend/browser tests use Node.js and Playwright:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

On macOS with Google Chrome installed, the browser test can instead use:

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

The browser test launches a temporary **Python** server and database. Use `PYTHON`
to override its default `.venv/bin/python`. Tests never use your demo database.
Tests cover persistence, concurrent conflicts, authorization, legacy password/session
compatibility, validation, UI creation/edit/cancel, admin synchronization, login in a
second browser and mobile widths. Existing admin CDN resources need internet.

## Migration from Node.js

The SQLite schema, password format, cookies and API contract are compatible. Existing
Node-backend reservations and accounts can be used without importing or resetting.
The former Node server remains in Git history/on `codex/seatsync-backend`; the Python
implementation is on `codex/seatsync-python`. Do not run both on the same port.

Old frontend-only localStorage bookings have no verified owner and are not imported
automatically. They remain untouched. A new booking through this server uses SQLite.
For backups, stop the app and copy the entire data directory, or use SQLite's backup API.

## Deployment

Existing public site: https://uuulllluo324932ujdsnanc.pythonanywhere.com/

The integrated version is in `main`. The public server continues using its previously
deployed code until updated and reloaded. Local and hosted SQLite files are separate;
Git transfers code, not account or booking data. See [integration notes](docs/TEAM-INTEGRATION.md)
for the source branches, decisions and verification.

Use a Python 3.11+ host with HTTPS and a persistent writable disk. Install with
`python -m pip install -r requirements.txt`, start with `python app.py`, one instance.
Set `HOST=0.0.0.0`, the host's `PORT`, and `DATABASE_PATH` to a file on the persistent
disk. Set `SEATSYNC_ENV=production` for Secure cookies (requires HTTPS). If the host
uses exactly one trusted reverse proxy, set `TRUST_PROXY=1`; otherwise configure
proxy trust for that host before publishing. The login rate limiter is process-local.
Multiple independent SQLite files or ephemeral disks are not suitable.

`.env.example` documents variables. The app reads the process environment; copying
that file does not automatically load it. On PythonAnywhere, keep the existing virtualenv and WSGI setup, update the code after
review, and use Web → Reload. Back up the database with SQLite backup before updating.

## Team, scope and defense

Darina: homepage and updated discovery design. Malika: admin UI and management workflows. Uldana: booking, confirmation,
cancellation and their integration. Each member must explain their own work and
make their own meaningful commits; do not attribute another person's commits to them.

See [Russian defense walkthrough](docs/BACKEND-GUIDE-RU.md) and
[historical Stage 2 notes](docs/STAGE2-HISTORY.md). Stage 2's Python static-server and
localStorage instructions are historical and do not apply to this version.

Venue names come from team references. Opening hours, table layouts and capacities
are illustrative; generated atmosphere images are not real venue photographs. Halyk
ePay runs in the bank's **test sandbox** with test cards — no real money moves. Kaspi
and the card form are **visual simulations**. No real venue reservation, live chat,
email verification or password recovery is connected. Existing admin CDN styles/icons/fonts still require internet.

Framework references: [Flask installation](https://flask.palletsprojects.com/en/stable/installation/)
and [Flask SQLite pattern](https://flask.palletsprojects.com/en/stable/patterns/sqlite3/).
