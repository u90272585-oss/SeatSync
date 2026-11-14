"""Demo payments. A new booking holds its table for 10 minutes. No real money is involved."""
from uuid import uuid4
from flask import g, jsonify, request

HOLD_SECONDS = 600
AMOUNT = 100
CURRENCY = 'KZT'
METHODS = ('halyk', 'kaspi', 'card')
OUTCOMES = ('success', 'failure', 'expire')


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


def register(app, *, db, transaction, APIError, get_booking, require_account, clock):
    @app.before_request
    def release_expired_holds():
        if request.path.startswith('/api/') and request.path != '/api/health':
            sweep(db(), transaction, clock)

    def payment_for(booking_id):
        return db().execute('SELECT * FROM payments WHERE booking_id=?', (booking_id,)).fetchone()

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
        if method not in METHODS:
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
