'use strict';

// Storage is optional: query parameters still carry the booking if it is blocked.
window.SeatSyncBookingStorage = (() => {
  const receiptKey = 'seatsync.booking.confirmed.v1';
  const cancelledKey = 'seatsync.booking.cancelled.v1';
  const ledgerKey = 'seatsync.bookings.shared.v1';
  const draftKey = 'seatsync.booking.draft.v1';
  function readReceipt() {
    try {
      const value = JSON.parse(localStorage.getItem(receiptKey));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
  }
  // Merge legacy profile bookings and the last guest receipt by ID. The shared
  // record wins, so opening an old confirmation cannot undo an edit.
  function list() {
    function array(key) {
      try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
      catch { return []; }
    }
    const merged = new Map();
    for (const item of [...array('seatsync.demo.bookings.v1'), readReceipt(), ...array(ledgerKey)]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string'
          || !/^[a-zA-Z0-9-]{10,80}$/.test(item.id) || !item.venue || !item.date || !item.time) continue;
      if (window.SeatSyncBooking && window.SeatSyncBooking.validate(item, new Date(), true)) continue;
      merged.set(item.id, { ...merged.get(item.id), ...item });
    }
    const cancelled = cancellations();
    return [...merged.values()].map(item => ({ ...item,
      status: cancelled.includes(item.id) || item.status === 'cancelled' ? 'cancelled' : 'confirmed' }));
  }
  function find(id) { return list().find(item => item.id === id) || null; }
  function saveShared(booking) {
    const all = list();
    const index = all.findIndex(item => item.id === booking.id);
    const previous = all[index];
    const record = { ...previous, ...booking,
      status: isCancelled(booking.id) || previous?.status === 'cancelled' ? 'cancelled' : booking.status || 'confirmed' };
    if (index < 0) all.push(record); else all[index] = record;
    try { localStorage.setItem(ledgerKey, JSON.stringify(all)); return true; }
    catch { return false; }
  }
  function cancellations() {
    try {
      const value = JSON.parse(localStorage.getItem(cancelledKey));
      return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
    } catch { return []; }
  }
  function isCancelled(id) {
    if (!id) return false;
    const receipt = readReceipt();
    return cancellations().includes(id) || (receipt?.id === id && receipt.status === 'cancelled')
      || Boolean(window.SeatSyncAccount?.bookings().some(item => item.id === id && item.status === 'cancelled'));
  }
  function cancel(booking) {
    // Write the ID first so old confirmation URLs cannot reactivate this booking.
    try {
      localStorage.setItem(cancelledKey, JSON.stringify([...new Set([...cancellations(), booking.id])]));
    } catch { return false; }
    saveReceipt({ ...booking, status: 'cancelled' });
    return true;
  }
  function saveReceipt(booking) {
    if (isCancelled(booking.id)) booking = { ...booking, status: 'cancelled' };
    try {
      localStorage.setItem(receiptKey, JSON.stringify(booking));
    } catch { return false; }
    // Only clear the draft that was confirmed; another tab may have a different draft.
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey));
      if (draft && ['venue', 'date', 'time', 'guests', 'table'].every(key => draft[key] === booking[key])) {
        localStorage.removeItem(draftKey);
      }
    } catch { /* An unreadable draft does not invalidate the saved receipt. */ }
    return saveShared(booking);
  }
  return { readReceipt, saveReceipt, isCancelled, cancel, list, find, saveShared };
})();
