# SeatSync backend

This folder contains the FastAPI backend for the SeatSync reservation system.

## Quick start

1. Create a local environment file from `.env.example`.
2. Generate a unique JWT signing secret with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`, then set `SEATSYNC_JWT_SECRET_KEY` and a unique `SEATSYNC_FIRST_ADMIN_PASSWORD` in `.env`.
3. Install dependencies:
   `python3 -m pip install -r requirements.txt`
4. Run database migrations or initialize the SQLite database:
   `python3 -m alembic upgrade head`
5. Bootstrap the first administrator using the password set in `.env`:
   `python3 -m app.cli --email admin@seatsync.com --name "SeatSync Admin"`
6. Start the API on port 8001:
   `uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload`
7. Open the API docs: http://127.0.0.1:8001/docs

## Environment variables

See `.env.example` for the required configuration.
