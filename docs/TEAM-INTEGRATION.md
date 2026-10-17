# Team integration — 17 October 2026

Developed on `codex/team-integration-auth`, based on main `50175e2`; approved for main.

## Source work and decisions

- Darina: `origin/darina-homepage` at `b0713dc`. Ported discovery search,
  category filtering and favorites onto the existing homepage, keeping the eight
  image/menu/detail cards. Google Maps links and the Vanilla card were removed
  after review, as requested. Her branch contained unresolved conflict markers, so
  its entire HTML was not copied over the working page. Search/favorites needed
  implementation, not just markup. Legacy homepage files lead to the single home.
- Uldana: existing booking, edit/cancel, confirmation, venue/menu pages retained.
  The selected venue and query parameters survive registration/login. Password
  visibility toggle retained. Browsing is public; making bookings requires login.
- Malika: `origin/team-integration-work` at `003a3f3` (the separate `Malika-Admin`
  branch is older). Ported table block/capacity, registered-customer booking,
  export and quick-action behavior into the existing shared dashboard. Existing
  search/status/date filters, statistics and booking edit/cancel remain connected.
- One Flask server and SQLite database. No second FastAPI server, JWT layer, or
  conflicting booking schema. All permissions come from the session and database.
- Consistent statuses: confirmed/cancelled. A booking confirms immediately;
  pending approval is not part of this integrated version.
- One table ID identifies a template. Overrides are keyed by venue plus table ID,
  so blocking table 1 in Skyberry does not block table 1 in AQQU.

## Data and rollback

The only schema addition is `venue_tables`. Existing users, passwords, reservations
and sessions are retained. No migration rewrites existing bookings. Initialization
and restart preserve overrides. Back up a live database through SQLite's backup
API (rather than copying only a SQLite file while WAL writes are active).

The published server has not been updated by this integration. Preview uses a
separate copy of the local database; preview activity does not modify the original
`data/seatsync.sqlite`. The main update is approved; PythonAnywhere requires a separate code update and Reload.

## Verification

- Python: 11 tests covering auth, ownership, concurrent overlapping requests,
  persistence, validation, per-venue settings, protection of active reservations,
  CSV access and legacy guest-account attachment.
- JavaScript: 9 tests for booking rules, API adapter and shared catalogue.
- Playwright in installed Chrome: discovery/favorites, register-before-booking and
  return to the selected venue, password eye, booking conflict, edit/cancel,
  administrator synchronization, actual downloaded CSV contents, table block and
  capacity reflected on the customer form, cross-browser login and role checks.
- Tests use temporary databases; the production server is not a test target.

The browser suite also checks administrator-created customer reservations and
390px layouts. A real Safari/device pass is still useful before presentation;
Chrome emulation does not constitute testing on all physical devices.

## Demonstration

1. Open the homepage signed out, search a venue, save a favorite, open its menu.
2. Press Book a table. Register (or choose Sign in for an existing account).
3. Select a future date, time, table and accept terms. Confirm the booking.
4. In a second browser/profile sign in as admin. Find the same booking.
5. Edit or cancel and show the update in the customer account.
6. Show table block/capacity controls and download the CSV.
7. Open SQLite tables users/venues/tables/bookings/venue_tables to explain storage.

Demo venue layouts/capacities are illustrative; no real restaurant booking,
payment, verification email or recovery email is sent. Favorites are per device, not synchronized account data.

After review, the home and admin headers use the original SeatSync brandbook icon
and matching two-color wordmark.
