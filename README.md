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

### Guest and customer accounts

Guests can book without registering. A server-issued HttpOnly cookie grants access
to the guest's bookings. Losing the cookie loses guest access, not the database row.
Register or sign in in that browser to attach its anonymous bookings to the account.
Customers can sign in on another browser to see their own bookings; administrators
can manage all prototype bookings. Passwords are stored as salted scrypt hashes.

## Booking behavior

Choose venue → date/time → guests → table → accept demo terms → confirm.
The backend independently checks all submitted fields and saves inside a SQLite
transaction. A 90-minute visit cannot overlap another active booking at the same
venue/table. An adjacent visit starting at the previous visit's end is allowed.

Editing retains the ID. A `version` check rejects edits based on outdated data.
Cancellation changes status to `cancelled`, preserves history and frees the table.
Cancelled or already-started bookings cannot be edited. Started bookings cannot
be cancelled. All booking times use `Asia/Almaty`, regardless of device timezone.

Confirmation, My bookings and the admin dashboard poll the API every five seconds
while visible, and on focus. They retain the existing designs. There is no WebSocket
or live support chat. Only unfinished form drafts remain in localStorage.

## Python code map

| File | Responsibility |
| --- | --- |
| `app.py` | Start the Python HTTP server |
| `server/app.py` | Flask routes, sessions, access checks and booking operations |
| `server/database.py` | SQLite connection, initialization and transactions |
| `server/schema.sql` | SQL tables and indexes |
| `server/rules.py` | Server-side input validation and Almaty time |
| `server/auth.py` | Password hashing and verification |
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
| `POST /api/bookings` | Create `{venue,date,time,guests,table}` |
| `PUT /api/bookings/:id` | Edit those fields, with current `version` |
| `POST /api/bookings/:id/cancel` | Cancel a future booking |

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

**No public deployment has been created.** Localhost is only the local demonstration.
A public live URL is still a separate midterm requirement.

Use a Python 3.11+ host with HTTPS and a persistent writable disk. Install with
`python -m pip install -r requirements.txt`, start with `python app.py`, one instance.
Set `HOST=0.0.0.0`, the host's `PORT`, and `DATABASE_PATH` to a file on the persistent
disk. Set `SEATSYNC_ENV=production` for Secure cookies (requires HTTPS). If the host
uses exactly one trusted reverse proxy, set `TRUST_PROXY=1`; otherwise configure
proxy trust for that host before publishing. The login rate limiter is process-local.
Multiple independent SQLite files or ephemeral disks are not suitable.

`.env.example` documents variables. The app reads the process environment; copying
that file does not automatically load it. No hosting service has been purchased or
provisioned. Add a real public URL only after deployment and external verification.

## Team, scope and defense

Darina: original homepage. Malika: original admin UI. Uldana: booking, confirmation,
cancellation and their integration. Each member must explain their own work and
make their own meaningful commits; do not attribute another person's commits to them.

See [Russian defense walkthrough](docs/BACKEND-GUIDE-RU.md) and
[historical Stage 2 notes](docs/STAGE2-HISTORY.md). Stage 2's Python static-server and
localStorage instructions are historical and do not apply to this version.

Venue names come from team references. Opening hours, table layouts and capacities
are illustrative; generated atmosphere images are not real venue photographs. No
payment, real venue reservation, live chat, email verification or password recovery
is connected. Existing admin CDN styles/icons/fonts still require internet.

Framework references: [Flask installation](https://flask.palletsprojects.com/en/stable/installation/)
and [Flask SQLite pattern](https://flask.palletsprojects.com/en/stable/patterns/sqlite3/).
