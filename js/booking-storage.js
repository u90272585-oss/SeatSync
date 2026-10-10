'use strict';

// Storage is optional: query parameters still carry the booking if it is blocked.
window.SeatSyncBookingStorage = (() => {
  const receiptKey = 'seatsync.booking.confirmed.v1';
  const cancelledKey = 'seatsync.booking.cancelled.v1';
  const draftKey = 'seatsync.booking.draft.v1';
  function readReceipt() {
    try {
      const value = JSON.parse(localStorage.getItem(receiptKey));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
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
    return true;
  }
  return { readReceipt, saveReceipt, isCancelled, cancel };
})();
