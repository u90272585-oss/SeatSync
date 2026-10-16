"""Flask routes: sessions, accounts and table reservations."""
import hashlib
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from . import rules
from .auth import hash_password, verify_password
from .database import ROOT, connect, initialize, transaction


class APIError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def public_user(user):
    return {key: user[key] for key in ('id', 'name', 'email', 'role')} if user else None


def public_booking(row):
    return dict(id=row['id'], venue=row['venue'], date=row['date'], time=row['time'],
                guests=str(row['guests']), table=row['table_id'], name=row['name'],
                status=row['status'], version=row['version'],
                createdAt=row['created_at'], updatedAt=row['updated_at'])


def minutes(value):
    hour, minute = map(int, value.split(':'))
    return hour * 60 + minute


def credentials(body):
    email = body.get('email', '')
    password = body.get('password')
    email = email.strip().lower() if isinstance(email, str) else ''
    if (not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254
            or not isinstance(password, str) or not 10 <= len(password) <= 128):
        raise APIError(400, 'Enter a valid email and a password of 10–128 characters.')
    return email, password


def valid_name(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 60:
        raise APIError(400, 'Enter a name of 1–60 characters.')
    return value.strip()


def create_app(database_path=None, *, production=None, clock=None):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024
    database_path = str(database_path or os.environ.get('DATABASE_PATH', ROOT / 'data/seatsync.sqlite'))
    production = production if production is not None else os.environ.get('SEATSYNC_ENV') == 'production'
    clock = clock or (lambda: datetime.now(timezone.utc))
    # Enable only behind a known single reverse proxy. Local clients are never trusted.
    if production and os.environ.get('TRUST_PROXY') == '1':
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    initialize(database_path)
    attempts = {}
    attempts_lock = threading.Lock()

    def db():
        if 'db' not in g:
            g.db = connect(database_path)
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        connection = g.pop('db', None)
        if connection is not None:
            connection.close()

    def new_session(user_id=None):
        token = secrets.token_hex(32)
        session = dict(id=hashlib.sha256(token.encode()).hexdigest(), user_id=user_id,
                       expires=int(time.time() * 1000) + 30 * 86400000)
        db().execute('INSERT INTO sessions VALUES (?,?,?)', tuple(session.values()))
        g.cookie_token = token
        return session

    @app.before_request
    def prepare_api():
        if not request.path.startswith('/api/'):
            return
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('X-SeatSync-Request') != '1':
                raise APIError(403, 'Invalid request. Reload the page and try again.')
            if request.headers.get('Origin') not in (None, request.host_url.rstrip('/')):
                raise APIError(403, 'Cross-origin request denied.')
            if not request.is_json:
                raise APIError(415, 'Use JSON for API requests.')
            g.body = request.get_json()
            if not isinstance(g.body, dict):
                raise APIError(400, 'Send a JSON object.')
        if request.path == '/api/health':
            return
        token = request.cookies.get('seatsync_session', '')
        session = None
        if re.fullmatch(r'[a-f0-9]{64}', token):
            session = db().execute('SELECT * FROM sessions WHERE id=? AND expires>?',
                                  (hashlib.sha256(token.encode()).hexdigest(), int(time.time() * 1000))).fetchone()
        g.session = session or new_session()
        g.user = db().execute('SELECT * FROM users WHERE id=?', (g.session['user_id'],)).fetchone()

    @app.after_request
    def response_headers(response):
        response.headers.update({'X-Content-Type-Options': 'nosniff',
                                 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY'})
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        if getattr(g, 'cookie_token', None):
            response.set_cookie('seatsync_session', g.cookie_token, max_age=30 * 86400,
                                httponly=True, samesite='Lax', secure=production)
        if getattr(g, 'clear_cookie', False):
            response.delete_cookie('seatsync_session', httponly=True, samesite='Lax', secure=production)
        return response

    @app.errorhandler(APIError)
    def api_error(error):
        return jsonify(error=error.message), error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected(error):
        app.logger.exception('Request failed')
        return jsonify(error='The server could not complete this request. Please try again.'), 500

    def limit_auth():
        current = time.time()
        with attempts_lock:
            for ip in list(attempts):
                if attempts[ip][1] < current:
                    del attempts[ip]
            count, expires = attempts.get(request.remote_addr, (0, current + 600))
            attempts[request.remote_addr] = (count + 1, expires)
            if count >= 20:
                raise APIError(429, 'Too many sign-in attempts. Try again in 10 minutes.')

    def signed_in(user):
        with transaction(db()):
            db().execute('UPDATE bookings SET user_id=? WHERE guest_session=? AND user_id IS NULL',
                         (user['id'], g.session['id']))
            db().execute('DELETE FROM sessions WHERE id=?', (g.session['id'],))
            new_session(user['id'])
        return jsonify(user=public_user(user))

    @app.get('/api/health')
    def health():
        db().execute('SELECT 1').fetchone()
        return jsonify(ok=True, storage='sqlite', backend='python-flask')

    @app.get('/api/session')
    def session():
        return jsonify(user=public_user(g.user))

    @app.post('/api/auth/register')
    def register():
        limit_auth()
        email, password = credentials(g.body)
        name = valid_name(g.body.get('name'))
        user_id = str(uuid4())
        try:
            db().execute('INSERT INTO users VALUES (?,?,?,?,?)',
                         (user_id, name, email, hash_password(password), 'customer'))
        except sqlite3.IntegrityError:
            raise APIError(409, 'This email is already registered. Sign in instead.')
        return signed_in(db().execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone())

    @app.post('/api/auth/login')
    def login():
        limit_auth()
        email, password = credentials(g.body)
        user = db().execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        if not user or not verify_password(password, user['password_hash']):
            raise APIError(401, 'Incorrect email or password.')
        return signed_in(user)

    @app.post('/api/auth/logout')
    def logout():
        db().execute('DELETE FROM sessions WHERE id=?', (g.session['id'],))
        g.cookie_token = None
        g.clear_cookie = True
        return jsonify(ok=True)

    @app.patch('/api/profile')
    def profile():
        if not g.user:
            raise APIError(401, 'Sign in first.')
        name = valid_name(g.body.get('name'))
        db().execute('UPDATE users SET name=? WHERE id=?', (name, g.user['id']))
        return jsonify(user={**public_user(g.user), 'name': name})

    def admin():
        return g.user is not None and g.user['role'] == 'admin'

    def get_booking(booking_id):
        row = db().execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone()
        if row is None:
            raise APIError(404, 'Booking not found or not accessible in this session.')
        if row['user_id']:
            # A registered customer's booking belongs only to that account.
            owned = g.user is not None and row['user_id'] == g.user['id']
        else:
            # An anonymous booking belongs to the browser's server session.
            owned = row['guest_session'] == g.session['id']
        if not admin() and not owned:
            raise APIError(404, 'Booking not found or not accessible in this session.')
        return row

    def validate():
        try:
            return rules.validate(g.body, clock())
        except ValueError as error:
            raise APIError(400, str(error))

    def conflict(booking, exclude=''):
        return db().execute('''SELECT id FROM bookings
            WHERE venue=? AND date=? AND table_id=? AND status='confirmed'
            AND id<>? AND start_minute<? AND end_minute>?''',
            (booking['venue'], booking['date'], booking['table'], exclude,
             minutes(booking['time']) + 90, minutes(booking['time']))).fetchone()

    @app.get('/api/venues')
    def venues():
        return jsonify([dict(row) for row in db().execute('SELECT * FROM venues')])

    @app.get('/api/availability')
    def availability():
        venue, date, time_value = (request.args.get(key) for key in ('venue', 'date', 'time'))
        if (not db().execute('SELECT id FROM venues WHERE id=?', (venue,)).fetchone()
                or not rules.is_date(date) or time_value not in rules.TIMES):
            raise APIError(400, 'Select a valid venue, date and time.')
        exclude = get_booking(request.args['exclude'])['id'] if 'exclude' in request.args else ''
        return jsonify([{**table, 'available': not table.get('occupied', False) and not bool(conflict(
            dict(venue=venue, date=date, time=time_value, table=table['id']), exclude))} for table in rules.TABLES])

    @app.get('/api/bookings')
    def bookings():
        if admin():
            rows = db().execute('SELECT * FROM bookings ORDER BY date,time')
        elif g.user:
            rows = db().execute('SELECT * FROM bookings WHERE user_id=? ORDER BY date,time', (g.user['id'],))
        else:
            rows = db().execute('SELECT * FROM bookings WHERE user_id IS NULL AND guest_session=? ORDER BY date,time',
                                (g.session['id'],))
        return jsonify([public_booking(row) for row in rows])

    @app.get('/api/bookings/<booking_id>')
    def booking(booking_id):
        return jsonify(public_booking(get_booking(booking_id)))

    @app.post('/api/bookings')
    def create_booking():
        data = validate()
        booking_id, stamp = str(uuid4()), clock().isoformat()
        name = valid_name(g.body.get('name', g.user['name'])) if admin() else g.user['name'] if g.user else 'Guest'
        with transaction(db()):
            if conflict(data):
                raise APIError(409, 'This table is already reserved during your visit. Choose another table or time.')
            db().execute('''INSERT INTO bookings
                (id,venue,date,time,start_minute,end_minute,guests,table_id,name,status,user_id,guest_session,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?)''',
                (booking_id, data['venue'], data['date'], data['time'], minutes(data['time']),
                 minutes(data['time']) + 90, int(data['guests']), data['table'], name,
                 g.user['id'] if g.user and not admin() else None, g.session['id'], stamp, stamp))
        return jsonify(public_booking(get_booking(booking_id))), 201

    @app.put('/api/bookings/<booking_id>')
    def edit_booking(booking_id):
        data = validate()
        with transaction(db()):
            previous = get_booking(booking_id)
            if previous['status'] == 'cancelled':
                raise APIError(409, 'Cancelled bookings cannot be edited.')
            if not rules.is_future(previous['date'], previous['time'], clock()):
                raise APIError(409, 'Past bookings cannot be edited.')
            if type(g.body.get('version')) is not int or g.body['version'] != previous['version']:
                raise APIError(409, 'This booking changed elsewhere. Reload before editing.')
            if conflict(data, booking_id):
                raise APIError(409, 'This table is already reserved during your visit. Choose another table or time.')
            db().execute('''UPDATE bookings SET venue=?,date=?,time=?,start_minute=?,end_minute=?,guests=?,table_id=?,
                version=version+1,updated_at=? WHERE id=?''',
                (data['venue'], data['date'], data['time'], minutes(data['time']), minutes(data['time']) + 90,
                 int(data['guests']), data['table'], clock().isoformat(), booking_id))
        return jsonify(public_booking(get_booking(booking_id)))

    @app.post('/api/bookings/<booking_id>/cancel')
    def cancel_booking(booking_id):
        with transaction(db()):
            previous = get_booking(booking_id)
            if previous['status'] != 'cancelled':
                if not rules.is_future(previous['date'], previous['time'], clock()):
                    raise APIError(409, 'The visit has already started.')
                db().execute("UPDATE bookings SET status='cancelled',version=version+1,updated_at=? WHERE id=?",
                             (clock().isoformat(), booking_id))
        return jsonify(public_booking(get_booking(booking_id)))

    @app.get('/')
    def home():
        return send_from_directory(ROOT, 'index.html')

    @app.get('/<path:filename>')
    def public_file(filename):
        # Never expose SQLite, .env, Python sources, tests or virtual environments.
        parts = Path(filename).parts
        root_files = {'index.html', 'darina-home.html', 'admin.dashbroad.html', 'booking-home.html',
                      'team-demo.html', 'darina-style.css', 'darina-main.js'}
        if any(part.startswith('.') for part in parts):
            raise APIError(404, 'Not found.')
        if filename not in root_files and (len(parts) < 2 or parts[0] not in {'css', 'js', 'assets', 'pages'}):
            raise APIError(404, 'Not found.')
        return send_from_directory(ROOT, filename)

    return app
