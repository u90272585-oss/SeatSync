PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','admin')) DEFAULT 'customer'
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, seats INTEGER NOT NULL, blocked INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, venue TEXT NOT NULL REFERENCES venues(id), date TEXT NOT NULL,
      time TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
      guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 6), table_id TEXT NOT NULL REFERENCES tables(id),
      name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')),
      user_id TEXT REFERENCES users(id), guest_session TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS booking_slot ON bookings(venue,date,table_id,status,start_minute,end_minute);
    CREATE INDEX IF NOT EXISTS booking_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS booking_guest ON bookings(guest_session);
  
