# SeatSync

SeatSync is a café and restaurant reservation system with a static frontend and a FastAPI backend. Accounts, reservations, table availability, and administrator operations use the backend database; no payment is collected.

## Stack
- Python 3.9+
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL-ready configuration with SQLite fallback for local development
- Alembic migrations
- Pydantic v2 validation
- Argon2 password hashing
- Pytest + HTTPX

## Project structure
- `backend/` — API, models, database, and tests
- `js/` and `pages/` — static frontend pages and API integrations
- `css/` — styles
- `assets/` — icons and images

## Local setup

1. Open a terminal in the project root.
2. Create a Python environment and install dependencies:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   python3 -m pip install -r requirements.txt
   cp .env.example .env
   ```
3. Review `.env`. Generate a unique JWT signing secret with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`, then set `SEATSYNC_JWT_SECRET_KEY` and a unique `SEATSYNC_FIRST_ADMIN_PASSWORD` in `.env`.
4. Run the database migration:
   ```bash
   python3 -m alembic upgrade head
   ```
5. Bootstrap the first admin account using the password configured in `.env`:
   ```bash
   python3 -m app.cli --email admin@seatsync.com --name "SeatSync Admin"
   ```
6. Start the API on port 8001:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
   ```
7. Start the frontend static server from the project root:
   ```bash
   cd ..
   python3 -m http.server 8000 --bind 127.0.0.1
   ```
8. Open the app at http://127.0.0.1:8000/
9. Open the API docs at http://127.0.0.1:8001/docs

## Backend API summary
- Health: `GET /api/health`
- Venues: `GET /api/venues`, `GET /api/venues/{venue_id}`
- Availability: `GET /api/venues/{venue_id}/availability?date=YYYY-MM-DD&time=HH:MM&guest_count=N`
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH /api/auth/me`
- Bookings: `POST /api/bookings`, `GET /api/bookings/my`, `GET/PATCH /api/bookings/{booking_id}`, `POST /api/bookings/{booking_id}/cancel`
- Admin bookings: `GET/POST /api/admin/bookings`, `GET/PATCH /api/admin/bookings/{booking_id}`, `POST /api/admin/bookings/{booking_id}/cancel`
- Admin tables and statistics: `GET /api/admin/tables`, `PATCH /api/admin/tables/{table_id}`, `GET /api/admin/stats`
- CSV export: `GET /api/admin/bookings/export`

Booking creation requires a signed-in account. Availability is checked against active tables, venue hours, party size, and overlapping reservations. Administrator-created bookings require an existing registered customer's email address. Administrator permissions are determined by the backend account role, not by a browser-selected role.

## Production notes
- Use PostgreSQL by setting `SEATSYNC_DATABASE_URL` to a managed PostgreSQL instance.
- Keep the JWT secret and admin password in a secure environment manager.
- Restrict `SEATSYNC_CORS_ORIGINS` to trusted frontends.

## Testing
From the backend folder:
```bash
python3 -m pytest -q
```
