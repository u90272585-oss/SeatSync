// Run with: node --test tests/booking-rules.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: {}, Intl, Date });
for (const file of ['venues.js', 'booking-rules.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
}
const rules = context.window.SeatSyncBooking;
const now = new Date('2026-10-09T07:00:00Z'); // 12:00 in Almaty.
const booking = { venue: 'skyberry', date: '2026-10-09', time: '12:30', guests: '2', table: '1' };
test('accepts a future booking and the last demo slot', () => {
  assert.equal(rules.validate(booking, now), null);
  assert.equal(rules.validate({ ...booking, time: '18:30' }, now), null);
});
test('rejects impossible dates, past dates and past/current times', () => {
  for (const date of ['2027-02-29', '2026-02-30', '2026-13-01', '', '2026-10-08']) {
    assert.equal(rules.validate({ ...booking, date }, now).field, 'date');
  }
  assert.equal(rules.isDate('2028-02-29'), true);
  for (const time of ['09:00', '12:00', '12:15', '18:60', '19:00', '']) {
    assert.equal(rules.validate({ ...booking, time }, now).field, 'time');
  }
});
test('rejects occupied, undersized and unknown tables and invalid guests', () => {
  for (const table of ['7', '8', '99', '']) assert.equal(rules.validate({ ...booking, table }, now).field, 'table');
  assert.equal(rules.validate({ ...booking, guests: '6' }, now).field, 'table');
  assert.equal(rules.validate({ ...booking, guests: '6', table: '5' }, now), null);
  for (const guests of ['0', '7', '2.5', 'two']) assert.equal(rules.validate({ ...booking, guests }, now).field, 'guests');
});
test('checks venue IDs and missing data', () => {
  for (const venue of ['unknown', '__proto__', 'constructor']) assert.equal(rules.validate({ ...booking, venue }, now).field, 'venue');
  assert.equal(rules.validate(null, now).field, 'venue');
});
test('uses the venue timezone across midnight', () => {
  const midnight = new Date('2026-10-09T19:05:00Z');
  assert.equal(rules.nowInAlmaty(midnight).date, '2026-10-10');
  assert.equal(rules.nowInAlmaty(midnight).time, '00:05');
  assert.equal(rules.validate(booking, midnight).field, 'date');
});
