"""Isolated tests of the Python backend. Run: python -m unittest discover -s tests -p 'test_*.py'."""
import hashlib
import json
import secrets
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from server.app import create_app
from server.auth import hash_password, verify_password
from server.database import connect

NOW = datetime(2026, 10, 16, 7, tzinfo=timezone.utc)
BOOKING = dict(venue='skyberry', date='2027-03-01', time='14:00', guests='2', table='1')
HEADERS = {'X-SeatSync-Request': '1'}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / 'db.sqlite')
        self.app = create_app(self.path, clock=lambda: NOW)
        self.a, self.b = self.app.test_client(), self.app.test_client()
        for client in (self.a, self.b):
            client.get('/api/session')

    def send(self, client, path, body=None, method='POST'):
        return client.open(path, method=method, json=body or {}, headers=HEADERS)

    def create(self, client=None, **fields):
        client = client or self.a
        if not client.get('/api/session').json['user']:
            self.register(client, f'{id(client)}@example.com')
        return self.send(client, '/api/bookings', {**BOOKING, **fields})

    def register(self, client, email='test@example.com'):
        return self.send(client, '/api/auth/register', dict(name='Uldana', email=email,
                         password='test-password-123', role='admin'))

    def test_customer_crud_ownership_and_persistence(self):
        result = self.create()
        self.assertEqual(result.status_code, 201)
        record = result.json
        url = '/api/bookings/' + record['id']
        self.assertEqual(self.b.get(url).status_code, 404)
        self.assertEqual(self.send(self.b, url + '/cancel').status_code, 401)
        self.assertEqual(self.b.get('/api/bookings').json, [])
        self.assertEqual(self.send(self.a, url, {**BOOKING, 'time': '13:00', 'version': 1}, 'PUT').status_code, 200)
        self.assertEqual(self.send(self.a, url, {**BOOKING, 'version': 1}, 'PUT').status_code, 409)
        restarted = create_app(self.path, clock=lambda: NOW).test_client()
        restarted.set_cookie('seatsync_session', self.a.get_cookie('seatsync_session').value)
        self.assertEqual(restarted.get(url).json['time'], '13:00')
        self.assertEqual(self.send(self.a, url + '/cancel').json['status'], 'cancelled')
        self.assertEqual(self.send(self.a, url + '/cancel').status_code, 200)
        self.assertEqual(self.send(self.a, url, {**BOOKING, 'version': 3}, 'PUT').status_code, 409)
        self.assertEqual(self.create(self.b, time='13:00').status_code, 201)
        self.assertEqual(self.a.get('/api/bookings/missing').status_code, 404)

    def test_conflicts_concurrently_and_adjacent_slots(self):
        with ThreadPoolExecutor(2) as pool:
            responses = list(pool.map(self.create, [self.a, self.b]))
        self.assertEqual(sorted(r.status_code for r in responses), [201, 409])
        self.assertEqual(self.create(time='15:00').status_code, 409)
        self.assertEqual(self.create(time='15:30').status_code, 201)
        self.assertEqual(self.create(venue='aqqu').status_code, 201)
        self.assertEqual(self.create(table='2').status_code, 201)

    def test_validation_and_available_tables(self):
        for fields in [dict(date='2027-02-30'), dict(date='2020-01-01'), dict(time='18:45'),
                       dict(time='25:00'), dict(guests=7), dict(guests=True), dict(table=7),
                       dict(guests=6, table=1), dict(venue=['skyberry']), dict(date={})]:
            with self.subTest(fields=fields):
                self.assertEqual(self.create(**fields).status_code, 400)
        result = self.create(status='cancelled', id='fake', user_id='fake').json
        self.assertNotEqual(result['id'], 'fake')
        self.assertEqual(result['status'], 'confirmed')
        query = '/api/availability?venue=skyberry&date=2027-03-01&time=14:00'
        self.assertFalse(self.a.get(query).json[0]['available'])
        self.assertTrue(self.a.get(query + '&exclude=' + result['id']).json[0]['available'])
        self.assertEqual(self.b.get(query + '&exclude=' + result['id']).status_code, 404)

    def test_registration_claims_guest_cross_browser_login_and_logout(self):
        # Existing pre-integration guest reservations remain claimable on registration.
        db = connect(self.path)
        token = self.a.get_cookie('seatsync_session').value
        db.execute('''INSERT INTO bookings(id,venue,date,time,start_minute,end_minute,guests,table_id,name,status,guest_session,created_at,updated_at)
                    VALUES ('legacy-booking','skyberry','2027-03-01','14:00',840,930,2,'1','Guest','confirmed',?,'old','old')''',
                   (hashlib.sha256(token.encode()).hexdigest(),))
        db.close()
        record = {'id':'legacy-booking'}
        session = self.a.get_cookie('seatsync_session').value
        result = self.register(self.a)
        self.assertEqual(result.json['user']['role'], 'customer')
        self.assertNotEqual(self.a.get_cookie('seatsync_session').value, session)
        self.assertEqual(self.a.get('/api/bookings').json[0]['id'], record['id'])
        response = self.send(self.b, '/api/auth/login', dict(email='test@example.com', password='test-password-123'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.b.get('/api/bookings').json[0]['id'], record['id'])
        self.assertEqual(self.send(self.b, '/profile', {}).status_code, 405)
        self.assertEqual(self.send(self.b, '/api/profile', {'name': 'New Name'}, 'PATCH').json['user']['name'], 'New Name')
        self.assertEqual(self.send(self.b, '/api/auth/logout').status_code, 200)
        self.assertEqual(self.b.get('/api/bookings').json, [])
        self.register(self.b, 'other@example.com')
        self.assertEqual(self.b.get('/api/bookings/' + record['id']).status_code, 404)

    def test_administrator_can_manage_other_bookings(self):
        db = connect(self.path)
        db.execute('INSERT INTO users VALUES (?,?,?,?,?)', ('admin', 'Admin', 'admin@example.com', hash_password('admin-password-123'), 'admin'))
        db.close()
        self.send(self.b, '/api/auth/login', dict(email='admin@example.com', password='admin-password-123'))
        record = self.create().json
        self.assertEqual(self.b.get('/api/bookings').json[0]['id'], record['id'])
        self.assertEqual(self.send(self.b, '/api/bookings/' + record['id'] + '/cancel').status_code, 200)
        self.assertEqual(self.create(self.b, customer_email=f'{id(self.a)}@example.com').json['name'], 'Uldana')
        self.assertEqual(len(self.a.get('/api/bookings').json), 2)
        self.assertEqual(self.create(self.b, customer_email='unknown@example.com').status_code, 400)

    def test_guest_cannot_create_and_customer_cannot_manage_tables_or_export(self):
        self.assertEqual(self.send(self.a, '/api/bookings', BOOKING).status_code, 401)
        self.assertEqual(self.a.get('/api/admin/bookings/export').status_code, 401)
        self.register(self.a)
        self.assertEqual(self.a.get('/api/admin/bookings/export').status_code, 403)
        self.assertEqual(self.send(self.a, '/api/admin/tables/skyberry/1', {'blocked':True}, 'PATCH').status_code, 403)
        self.assertEqual(self.a.get('/api/admin/tables?venue=skyberry').status_code, 403)

    def test_table_changes_are_per_venue_persistent_and_respect_bookings(self):
        self.register(self.b, 'manager@example.com')
        db = connect(self.path)
        db.execute("UPDATE users SET role='admin' WHERE email='manager@example.com'")
        db.close()
        url = '/api/admin/tables/skyberry/1'
        self.assertEqual(self.send(self.b,url,{'blocked':True},'PATCH').status_code,200)
        self.assertEqual(self.create().status_code,400)
        self.assertEqual(self.create(venue='aqqu').status_code,201)
        self.assertEqual(self.send(self.b,url,{'blocked':False,'seats':4},'PATCH').status_code,200)
        self.assertEqual(self.create(guests=4).status_code,201)
        self.assertEqual(self.send(self.b,url,{'blocked':True},'PATCH').status_code,409)
        self.assertEqual(self.send(self.b,url,{'seats':2},'PATCH').status_code,409)
        self.assertEqual(self.send(self.b,url,{'seats':True},'PATCH').status_code,400)
        restarted = create_app(self.path, clock=lambda: NOW).test_client()
        table = restarted.get('/api/availability?venue=skyberry&date=2027-03-01&time=16:00').json[0]
        self.assertEqual(table['seats'],4)
        self.assertTrue(table['available'])
        report = self.b.get('/api/admin/bookings/export')
        self.assertEqual(report.status_code,200)
        self.assertIn('attachment;',report.headers['Content-Disposition'])
        self.assertIn('skyberry',report.text)
        self.assertNotIn('password_hash',report.text)

    def test_node_password_and_cookie_compatibility(self):
        fixture = json.loads((Path(__file__).parent / 'node-auth-fixture.json').read_text())
        self.assertTrue(verify_password(fixture['password'], fixture['hash']))
        self.assertFalse(verify_password('wrong-password', fixture['hash']))
        token = secrets.token_hex(32)
        db = connect(self.path)
        db.execute('INSERT INTO users VALUES (?,?,?,?,?)', ('legacy', 'Legacy', 'legacy@example.com', fixture['hash'], 'customer'))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), 'legacy', int(time.time()*1000)+60000))
        db.close()
        self.a.set_cookie('seatsync_session', token)
        self.assertEqual(self.a.get('/api/session').json['user']['name'], 'Legacy')
        self.assertEqual(self.send(self.b, '/api/auth/login', dict(email='legacy@example.com', password=fixture['password'])).status_code, 200)

    def test_security_headers_input_errors_and_static_isolation(self):
        self.assertEqual(self.a.post('/api/bookings', json=BOOKING).status_code, 403)
        self.assertEqual(self.a.post('/api/bookings', json=BOOKING, headers={**HEADERS, 'Origin': 'https://evil.test'}).status_code, 403)
        for body in [[], None, 'text']:
            self.assertEqual(self.a.post('/api/bookings', data=json.dumps(body), content_type='application/json', headers=HEADERS).status_code, 400)
        self.assertEqual(self.a.post('/api/bookings', data='{', content_type='application/json', headers=HEADERS).status_code, 400)
        self.assertEqual(self.a.post('/api/bookings', json={'x':'x'*17000}, headers=HEADERS).status_code, 413)
        for path in ['/server/app.py', '/data/seatsync.sqlite', '/.env', '/.git/config', '/requirements.txt', '/js/../server/app.py']:
            self.assertEqual(self.a.get(path).status_code, 404, path)
        with self.a.get('/') as response:
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.a.get('/api/health').json['backend'], 'python-flask')
        self.assertIn('HttpOnly', self.app.test_client().get('/api/session').headers['Set-Cookie'])

    def test_rate_limit_and_production_cookie(self):
        for _ in range(20):
            self.assertEqual(self.send(self.a, '/api/auth/login', dict(email='no@example.com', password='wrong-password')).status_code, 401)
        self.assertEqual(self.send(self.a, '/api/auth/login', dict(email='no@example.com', password='wrong-password')).status_code, 429)
        response = create_app(self.path, production=True).test_client().get('/api/session', base_url='https://localhost')
        self.assertIn('Secure', response.headers['Set-Cookie'])

    def test_past_booking_remains_readable_but_not_editable(self):
        record = self.create().json
        future_app = create_app(self.path, clock=lambda: datetime(2030,1,1,tzinfo=timezone.utc))
        client = future_app.test_client()
        client.set_cookie('seatsync_session', self.a.get_cookie('seatsync_session').value)
        url = '/api/bookings/' + record['id']
        self.assertEqual(client.get(url).status_code, 200)
        self.assertEqual(self.send(client, url + '/cancel').status_code, 409)
        self.assertEqual(self.send(client, url, {**BOOKING, 'date':'2031-01-01', 'version':1}, 'PUT').status_code, 409)


if __name__ == '__main__':
    unittest.main()
