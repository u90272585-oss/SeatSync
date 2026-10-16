"""SQLite connections and schema. Existing Node-era data remains compatible."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / 'server/catalog.json').read_text())


def connect(filename):
    db = sqlite3.connect(filename, timeout=5, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db


def initialize(filename):
    Path(filename).parent.mkdir(parents=True, exist_ok=True)
    db = connect(filename)
    try:
        db.executescript((ROOT / 'server/schema.sql').read_text())
        with transaction(db):
            for key, venue in CATALOG['venues'].items():
                db.execute('''INSERT INTO venues VALUES (?,?,?) ON CONFLICT(id)
                    DO UPDATE SET name=excluded.name,type=excluded.type''',
                           (key, venue['name'], venue['type']))
            for table in CATALOG['tables']:
                db.execute('''INSERT INTO tables VALUES (?,?,?,?) ON CONFLICT(id)
                    DO UPDATE SET name=excluded.name,seats=excluded.seats,blocked=excluded.blocked''',
                           (table['id'], table['name'], table['seats'], int(table.get('occupied', False))))
    finally:
        db.close()


@contextmanager
def transaction(db):
    """Lock before checking availability so concurrent bookings cannot both succeed."""
    db.execute('BEGIN IMMEDIATE')
    try:
        yield
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
