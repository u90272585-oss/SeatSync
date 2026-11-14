"""Payments. A new booking holds its table for 10 minutes.
Kaspi and card are simulations. Halyk uses Halyk ePay's public TEST environment, so no real money moves."""
import json
import os
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4
from flask import g, jsonify, request

HOLD_SECONDS = 600
AMOUNT = 100
CURRENCY = 'KZT'
DEMO_METHODS = ('kaspi', 'card')
OUTCOMES = ('success', 'failure', 'expire')
PAID_STATUSES = ('CHARGE', 'AUTH')

# Public sandbox credentials from epayment.kz/docs. For real keys set HALYK_* environment variables.
# The secret stays on the server and is never sent to the browser.
HALYK = dict(
    client_id=os.environ.get('HALYK_CLIENT_ID', 'test'),
    client_secret=os.environ.get('HALYK_CLIENT_SECRET', 'yF587AV9Ms94qN2QShFzVR3vFnWkhjbAK3sG'),
    terminal=os.environ.get('HALYK_TERMINAL_ID', '67e34d63-102f-4bd1-898e-370781d0074d'),
    oauth_url=os.environ.get('HALYK_OAUTH_URL', 'https://test-epay-oauth.epayment.kz/oauth2/token'),
    status_url=os.environ.get('HALYK_STATUS_URL',
                              'https://test-epay-api.epayment.kz/check-status/payment/transaction/'),
    script_url=os.environ.get('HALYK_SCRIPT_URL', 'https://test-epay.epayment.kz/payform/payment-api.js'),
)
SCOPE = 'webapi usermanagement email_send verification statement statistics payment'


class HalykError(Exception):
    pass


def http_json(req):
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        raise HalykError(f'HTTP {error.code}: {error.read().decode("utf-8", "replace")[:300]}')
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise HalykError(str(error))


def halyk_token(extra=None):
    form = {'grant_type': 'client_credentials', 'scope': SCOPE, 'client_id': HALYK['client_id'],
            'client_secret': HALYK['client_secret'], 'terminal': HALYK['terminal'], **(extra or {})}
    req = urllib.request.Request(HALYK['oauth_url'], data=urllib.parse.urlencode(form).encode(), method='POST')
    token = http_json(req)
    if not isinstance(token, dict) or not token.get('access_token'):
        raise HalykError('No access_token in the response')
    return token


def now_ms(clock):
    return int(clock().timestamp() * 1000)


def create_pending(db, booking_id, user_id, clock):
    stamp = clock().isoformat()
    db.execute(
        "INSERT INTO payments (id,booking_id,user_id,amount,currency,method,status,expires_at,created_at,updated_at) "
        "VALUES (?,?,?,?,?,NULL,'pending',?,?,?)",
        (str(uuid4()), booking_id, user_id, AMOUNT, CURRENCY,
         now_ms(clock) + HOLD_SECONDS * 1000, stamp, stamp))


def release(db, payment_id, booking_id, clock):
    """Mark the payment expired and free the table. Safe to call twice."""
    stamp = clock().isoformat()
    changed = db.execute(
        "UPDATE payments SET status='expired', updated_at=? WHERE id=? AND status='pending'",
        (stamp, payment_id)).rowcount
    if changed:
        db.execute(
            "UPDATE bookings SET status='cancelled', version=version+1, updated_at=? "
            "WHERE id=? AND status='confirmed'", (stamp, booking_id))
    return changed


def sweep(db, transaction, clock):
    due = db.execute("SELECT id, booking_id FROM payments WHERE status='pending' AND expires_at<=?",
                     (now_ms(clock),)).fetchall()
    if due:
        with transaction(db):
            for row in due:
                release(db, row['id'], row['booking_id'], clock)


def public_payment(row, clock):
    left = max(0, (row['expires_at'] - now_ms(clock)) // 1000) if row['status'] == 'pending' else 0
    return dict(id=row['id'], bookingId=row['booking_id'], status=row['status'], method=row['method'],
                amount=row['amount'], currency=row['currency'], secondsLeft=left,
                updatedAt=row['updated_at'])


def invoice_for(db, payment_id, clock):
    """Halyk wants a unique 6-15 digit order number. One invoice per payment."""
    for _ in range(20):
        row = db.execute('SELECT invoice_id FROM halyk_invoices WHERE payment_id=?', (payment_id,)).fetchone()
        if row:
            return row['invoice_id']
        invoice = str(secrets.randbelow(10 ** 9)).zfill(9)
        try:
            db.execute('INSERT INTO halyk_invoices VALUES (?,?,?,?)',
                       (invoice, invoice[-6:], payment_id, clock().isoformat()))
            return invoice
        except sqlite3.IntegrityError:
            continue
    raise HalykError('Could not create an invoice number')


def same_amount(value, expected):
    try:
        return float(value) == float(expected)
    except (TypeError, ValueError):
        return False


def register(app, *, db, transaction, APIError, get_booking, require_account, clock):
    @app.before_request
    def release_expired_holds():
        if request.path.startswith('/api/') and request.path != '/api/health':
            sweep(db(), transaction, clock)

    def payment_for(booking_id):
        return db().execute('SELECT * FROM payments WHERE booking_id=?', (booking_id,)).fetchone()

    def open_payment(booking_id):
        """The signed-in owner's booking and its payment, which must still be waiting."""
        require_account()
        booking = get_booking(booking_id)
        row = payment_for(booking['id'])
        if row is None:
            raise APIError(404, 'This booking does not need a payment.')
        if row['status'] == 'expired':
            raise APIError(409, 'Time ran out and the table was released. Please book again.')
        return booking, row

    @app.get('/api/bookings/<booking_id>/payment')
    def get_payment(booking_id):
        booking = get_booking(booking_id)
        row = payment_for(booking['id'])
        return jsonify(payment=public_payment(row, clock) if row else None)

    @app.post('/api/bookings/<booking_id>/payment/pay')
    def pay(booking_id):
        require_account()
        booking = get_booking(booking_id)
        method = g.body.get('method')
        outcome = g.body.get('outcome', 'success')
        if method not in DEMO_METHODS:
            raise APIError(400, 'Choose a payment method.')
        if outcome not in OUTCOMES:
            raise APIError(400, 'Unknown payment outcome.')
        expired = False
        with transaction(db()):
            row = payment_for(booking['id'])
            if row is None:
                raise APIError(404, 'This booking does not need a payment.')
            if row['status'] == 'paid' and outcome == 'success':
                pass
            elif row['status'] == 'expired':
                raise APIError(409, 'Time ran out and the table was released. Please book again.')
            elif row['status'] != 'pending':
                raise APIError(409, 'This payment is already finished.')
            elif db().execute('SELECT status FROM bookings WHERE id=?', (booking['id'],)).fetchone()['status'] != 'confirmed':
                raise APIError(409, 'This booking is cancelled.')
            elif outcome == 'expire' or row['expires_at'] <= now_ms(clock):
                release(db(), row['id'], booking['id'], clock)
                expired = True
            elif outcome == 'success':
                db().execute("UPDATE payments SET status='paid', method=?, updated_at=? WHERE id=? AND status='pending'",
                             (method, clock().isoformat(), row['id']))
        if expired and outcome != 'expire':
            raise APIError(409, 'Time ran out and the table was released. Please book again.')
        if outcome == 'failure':
            raise APIError(402, 'Payment declined (demo). Try another method before the timer ends.')
        return jsonify(payment=public_payment(payment_for(booking['id']), clock))

    @app.post('/api/bookings/<booking_id>/payment/halyk/start')
    def halyk_start(booking_id):
        booking, row = open_payment(booking_id)
        if row['status'] != 'pending':
            raise APIError(409, 'This payment is already finished.')
        if booking['status'] != 'confirmed':
            raise APIError(409, 'This booking is cancelled.')
        try:
            invoice = invoice_for(db(), row['id'], clock)
            base = request.host_url
            back = f"{base}pages/payment.html?id={booking['id']}"
            post_link = f'{base}api/halyk/postlink'
            auth = halyk_token({'invoiceID': invoice, 'amount': row['amount'], 'currency': row['currency'],
                                'postLink': post_link, 'failurePostLink': post_link})
        except HalykError as error:
            app.logger.warning('Halyk token request failed: %s', error)
            raise APIError(502, 'The Halyk test server did not accept the request. Try again or use another method.')
        return jsonify(script=HALYK['script_url'], payment=dict(
            invoiceId=invoice, backLink=f'{back}&halyk=return', failureBackLink=f'{back}&halyk=failed',
            postLink=post_link, failurePostLink=post_link, language='eng',
            description='SeatSync booking fee', terminal=HALYK['terminal'],
            amount=row['amount'], currency=row['currency'], auth=auth))

    @app.post('/api/bookings/<booking_id>/payment/halyk/verify')
    def halyk_verify(booking_id):
        booking, row = open_payment(booking_id)
        if row['status'] == 'paid':
            return jsonify(result='paid', payment=public_payment(row, clock))
        invoice = db().execute('SELECT invoice_id FROM halyk_invoices WHERE payment_id=?', (row['id'],)).fetchone()
        if invoice is None:
            raise APIError(409, 'No Halyk payment was started for this booking.')
        try:
            token = halyk_token()['access_token']
            info = http_json(urllib.request.Request(
                HALYK['status_url'] + urllib.parse.quote(invoice['invoice_id']),
                headers={'Authorization': f'Bearer {token}'}))
        except HalykError as error:
            app.logger.warning('Halyk status check failed: %s', error)
            raise APIError(502, 'Could not check the payment with Halyk. Try again in a moment.')
        code = str(info.get('resultCode'))
        tx = info.get('transaction') or {}
        status = tx.get('statusName')
        app.logger.info('Halyk status for %s: resultCode=%s statusName=%s', invoice['invoice_id'], code, status)
        if (code == '100' and status in PAID_STATUSES and str(tx.get('invoiceID')) == invoice['invoice_id']
                and same_amount(tx.get('amount'), row['amount'])):
            late = False
            with transaction(db()):
                current = payment_for(booking['id'])
                if current['status'] == 'pending':
                    db().execute("UPDATE payments SET status='paid', method='halyk', updated_at=? "
                                 "WHERE id=? AND status='pending'", (clock().isoformat(), current['id']))
                elif current['status'] == 'expired':
                    late = True
            if late:
                raise APIError(409, 'The 10 minutes ended before the payment was confirmed, so the table was released.')
            return jsonify(result='paid', payment=public_payment(payment_for(booking['id']), clock))
        if code in ('102', '107') or (code == '100' and status in ('NEW', 'FINGERPRINT')):
            return jsonify(result='processing'), 202
        raise APIError(402, 'Halyk did not complete this payment.')
