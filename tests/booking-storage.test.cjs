const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/booking-storage.js'), 'utf8');
function setup(blocked = false) {
  const values = new Map();
  const context = vm.createContext({ window: {}, localStorage: {
    getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) || null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); },
    removeItem(key) { values.delete(key); }
  }});
  vm.runInContext(source, context);
  return { storage: context.window.SeatSyncBookingStorage, values };
}
const receipt = { venue: 'aqqu', date: '2027-01-01', time: '12:00', guests: '2', table: '1', id: 'booking-test-123' };
test('round-trips a receipt and clears only a matching draft', () => {
  const { storage, values } = setup();
  values.set('seatsync.booking.draft.v1', JSON.stringify(receipt));
  assert.equal(storage.saveReceipt(receipt), true);
  assert.equal(storage.readReceipt().id, receipt.id);
  assert.equal(values.has('seatsync.booking.draft.v1'), false);
  const anotherDraft = JSON.stringify({ ...receipt, venue: 'skyberry' });
  values.set('seatsync.booking.draft.v1', anotherDraft);
  storage.saveReceipt(receipt);
  assert.equal(values.get('seatsync.booking.draft.v1'), anotherDraft);
});
test('handles missing, malformed and blocked storage', () => {
  const { storage, values } = setup();
  assert.equal(storage.readReceipt(), null);
  for (const invalid of ['{bad json', '[]', 'false', '"text"']) {
    values.set('seatsync.booking.confirmed.v1', invalid);
    assert.equal(storage.readReceipt(), null);
  }
  const blocked = setup(true).storage;
  assert.equal(blocked.readReceipt(), null);
  assert.equal(blocked.saveReceipt(receipt), false);
});

test('cancellation survives a new receipt and cannot be overwritten by an active save', () => {
  const { storage } = setup();
  assert.equal(storage.cancel(receipt), true);
  assert.equal(storage.isCancelled(receipt.id), true);
  assert.equal(storage.readReceipt().status, 'cancelled');
  storage.saveReceipt({ ...receipt, id: 'another-booking' });
  assert.equal(storage.isCancelled(receipt.id), true);
  storage.saveReceipt({ ...receipt, status: 'confirmed' });
  assert.equal(storage.readReceipt().status, 'cancelled');
});
test('blocked cancellation reports failure instead of claiming persistence', () => {
  const { storage } = setup(true);
  assert.equal(storage.cancel(receipt), false);
  assert.equal(storage.isCancelled(receipt.id), false);
});
