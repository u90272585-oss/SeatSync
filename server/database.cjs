'use strict';
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const venues = require('../js/venues.js');
const rules = require('../js/booking-rules.js');
function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
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
  `);
  const seedVenue = db.prepare('INSERT INTO venues VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type');
  for (const [id,v] of Object.entries(venues)) seedVenue.run(id,v.name,v.type);
  const seedTable = db.prepare('INSERT INTO tables VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,seats=excluded.seats,blocked=excluded.blocked');
  for (const t of rules.tables) seedTable.run(t.id,t.name,t.seats,Number(Boolean(t.occupied)));
  return db;
}
module.exports = { openDatabase };
