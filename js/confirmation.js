'use strict';

const rules = window.SeatSyncBooking;
const storage = window.SeatSyncBookingStorage;
const params = new URLSearchParams(location.search);
// A supplied URL must pass validation itself; never hide bad URL data with an old receipt.
let booking = location.search ? Object.fromEntries(params) : storage.readReceipt();
// Validate supplied fields first, then prefer the newest saved version of this ID.
if (booking && !rules.validate(booking, new Date(), true)) {
  booking = storage.find(booking.id) || booking;
}
const cancelled = booking && (booking.status === 'cancelled' || storage.isCancelled(booking.id));
const problem = rules.validate(booking, new Date(), cancelled);

if (problem) {
  document.querySelector('#empty-state').hidden = false;
} else {
  const table = rules.tables.find(table => table.id === booking.table);
  const venue = window.SEATSYNC_VENUES[booking.venue];
  if (!/^[a-zA-Z0-9-]{10,80}$/.test(booking.id || '')) booking.id = crypto.randomUUID();
  // Only copy the fields belonging to this flow into the confirmation/edit links.
  const details = {
    venue: booking.venue, date: booking.date, time: booking.time,
    guests: booking.guests, table: booking.table, id: booking.id, status: cancelled ? 'cancelled' : 'confirmed'
  };
  const query = new URLSearchParams(details);
  history.replaceState(null, '', `confirmation.html?${query}`);
  document.querySelector('#venue-name').textContent = venue.name;
  document.querySelector('#confirmed-reference').textContent = booking.id;
  document.querySelector('#confirmed-date').textContent = new Date(`${booking.date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'
  });
  document.querySelector('#confirmed-time').textContent = `${booking.time} · Almaty time`;
  document.querySelector('#confirmed-guests').textContent = `${booking.guests} ${booking.guests === '1' ? 'guest' : 'guests'}`;
  document.querySelector('#confirmed-table').textContent = `${table.name} · Table ${booking.table}`;
  const editLink = `booking.html?${query}`;
  document.querySelector('#edit-booking').href = editLink;
  document.querySelector('#back-booking').href = editLink;

  const saved = cancelled ? storage.cancel(details) : storage.saveReceipt(details);
  document.querySelector('#receipt-status').textContent = saved
    ? 'Confirmation saved on this browser, even without a profile. Reopen this page to see your latest booking.'
    : 'Browser storage is unavailable. Keep this confirmation link to reopen or edit your booking.';

  // Preserve the existing optional profile and My bookings integration.
  const status = document.querySelector('#save-status');
  const savedLink = document.querySelector('#saved-bookings-link');
  if (window.SeatSyncAccount.profile()) {
    try {
      window.SeatSyncAccount.saveBooking(details);
      status.textContent = 'Also saved to My bookings in this browser. No payment was made.';
    } catch {
      status.textContent = 'Could not update My bookings. Your confirmation details are still displayed here.';
    }
  } else {
    status.textContent = 'Want a list of your bookings? Open a demo profile to save this booking to My bookings.';
    savedLink.textContent = 'Sign in & save booking';
    savedLink.href = `account.html?${new URLSearchParams({ next: `confirmation.html?${query}` })}`;
    document.querySelectorAll('[data-account-link]').forEach(link => { link.href = savedLink.href; });
  }
  const cancelButton = document.querySelector('#cancel-booking');
  const cancelDialog = document.querySelector('#cancel-dialog');
  function showCancelled(persisted) {
    details.status = 'cancelled';
    query.set('status', 'cancelled');
    history.replaceState(null, '', `confirmation.html?${query}`);
    document.querySelector('#confirmation-title').textContent = 'Your booking is cancelled';
    document.querySelector('#confirmation-intro').textContent = 'This demo booking is no longer active. Your details remain here for reference.';
    const badge = document.querySelector('#booking-status');
    badge.textContent = 'Cancelled · Demo';
    badge.classList.add('cancelled-badge');
    document.querySelector('#edit-booking').hidden = true;
    cancelButton.hidden = true;
    const back = document.querySelector('#back-booking');
    back.href = '../index.html';
    back.textContent = '← Back to Home';
    document.querySelector('.success-mark').textContent = '×';
    document.querySelector('.ticket-note').textContent = 'This booking is cancelled. Start a new booking if your plans change.';
    document.querySelector('#confirmation > .demo-note').textContent = 'Demo cancellation · No money charged';
    const notice = document.querySelector('#cancellation-status');
    notice.hidden = false;
    notice.textContent = 'Cancelled. No additional fee applies. No money was charged in this demo.';
    document.querySelector('#receipt-status').textContent = persisted
      ? 'Cancellation saved in this browser. This booking cannot be edited or reactivated.'
      : 'Cancellation is shown in this link only. Browser storage is unavailable; older links may still show the booking. Keep this updated link.';
    if (!window.SeatSyncAccount.profile()) {
      savedLink.textContent = 'Sign in & save cancellation';
      status.textContent = 'You can keep this cancelled booking in your demo profile history.';
      savedLink.href = `account.html?${new URLSearchParams({next: `confirmation.html?${query}`})}`;
      document.querySelectorAll('[data-account-link]').forEach(link => { link.href = savedLink.href; });
    }
  }
  function syncCancellation() {
    if (storage.isCancelled(details.id)) showCancelled(true);
  }
  cancelButton.addEventListener('click', () => {
    if (storage.isCancelled(details.id)) { showCancelled(true); return; }
    if (!rules.isFuture(details.date, details.time)) {
      const notice = document.querySelector('#cancellation-status');
      notice.hidden = false;
      notice.textContent = 'The visit time has passed. This demo only allows cancellation before the visit.';
      return;
    }
    document.querySelector('#cancel-summary').textContent = `${venue.name} · ${details.date} · ${details.time} (Almaty) · ${details.guests} guests · Table ${details.table}`;
    const now = rules.nowInAlmaty();
    const hoursLeft = (new Date(`${details.date}T${details.time}:00Z`) - new Date(`${now.date}T${now.time}:00Z`)) / 3600000;
    document.querySelector('#late-cancellation').hidden = hoursLeft >= 24;
    cancelDialog.showModal();
  });
  document.querySelector('#keep-booking').addEventListener('click', () => cancelDialog.close());
  document.querySelector('#confirm-cancel').addEventListener('click', () => {
    if (!rules.isFuture(details.date, details.time)) {
      const message = document.querySelector('#cancel-error');
      message.hidden = false;
      message.textContent = 'The visit time has passed. Cancellation is no longer available.';
      return;
    }
    details.status = 'cancelled';
    const persisted = storage.cancel(details);
    if (window.SeatSyncAccount.profile()) {
      try { window.SeatSyncAccount.saveBooking(details); status.textContent = 'Cancelled booking retained in My bookings.'; }
      catch { status.textContent = 'My bookings could not be updated. Keep this cancellation link.'; }
    }
    showCancelled(persisted);
    cancelDialog.close();
    document.querySelector('#confirmation-title').setAttribute('tabindex', '-1');
    document.querySelector('#confirmation-title').focus();
  });
  if (cancelled) showCancelled(storage.isCancelled(details.id));
  window.addEventListener('storage', syncCancellation);
  window.addEventListener('pageshow', syncCancellation);
  document.querySelector('#empty-state').hidden = true;
  document.querySelector('#confirmation').hidden = false;
}
