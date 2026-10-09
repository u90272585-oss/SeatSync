'use strict';

// Storage is optional: query parameters still carry the booking if it is blocked.
window.SeatSyncBookingStorage = (() => {
  const receiptKey = 'seatsync.booking.confirmed.v1';
  const draftKey = 'seatsync.booking.draft.v1';
  function readReceipt() {
    try {
      const value = JSON.parse(localStorage.getItem(receiptKey));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
  }
  function saveReceipt(booking) {
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
  return { readReceipt, saveReceipt };
})();
