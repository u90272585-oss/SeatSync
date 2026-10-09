'use strict';

const rules = window.SeatSyncBooking;
const storage = window.SeatSyncBookingStorage;
const params = new URLSearchParams(location.search);
// A supplied URL must pass validation itself; never hide bad URL data with an old receipt.
const booking = location.search ? Object.fromEntries(params) : storage.readReceipt();
const problem = rules.validate(booking);

if (problem) {
  document.querySelector('#empty-state').hidden = false;
} else {
  const table = rules.tables.find(table => table.id === booking.table);
  const venue = window.SEATSYNC_VENUES[booking.venue];
  if (!/^[a-zA-Z0-9-]{10,80}$/.test(booking.id || '')) booking.id = crypto.randomUUID();
  // Only copy the fields belonging to this flow into the confirmation/edit links.
  const details = {
    venue: booking.venue, date: booking.date, time: booking.time,
    guests: booking.guests, table: booking.table, id: booking.id
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

  const saved = storage.saveReceipt(details);
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
  document.querySelector('#confirmation').hidden = false;
}
