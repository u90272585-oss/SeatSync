'use strict';

// Adapter for Malika's page: the original sample dashboard stays intact below.
(() => {
  const storage = window.SeatSyncBookingStorage;
  const venue = document.querySelector('#shared-venue');
  const date = document.querySelector('#shared-date');
  const status = document.querySelector('#shared-status');
  const search = document.querySelector('#searchInput');
  const rows = document.querySelector('#shared-rows');
  const message = document.querySelector('#shared-message');
  for (const [id, item] of Object.entries(window.SEATSYNC_VENUES)) {
    venue.add(new Option(item.name, id));
  }
  function link(label, page, booking) {
    const element = document.createElement('a');
    element.textContent = label;
    element.href = `pages/${page}.html?${new URLSearchParams({
      id: booking.id, venue: booking.venue, date: booking.date, time: booking.time,
      guests: booking.guests, table: booking.table, status: booking.status
    })}`;
    element.className = 'text-brand-600 font-bold mr-3';
    return element;
  }
  function render() {
    const bookings = storage.list().filter(item => (!venue.value || item.venue === venue.value)
      && (!date.value || item.date === date.value) && (!status.value || item.status === status.value)
      && `${window.SEATSYNC_VENUES[item.venue]?.name} ${item.id} ${item.date} ${item.time} table ${item.table}`.toLowerCase().includes(search.value.toLowerCase()))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    rows.replaceChildren();
    const active = bookings.filter(item => item.status !== 'cancelled');
    document.querySelector('#shared-summary').textContent = `${bookings.length} bookings · ${active.length} confirmed · ${active.reduce((sum, item) => sum + Number(item.guests), 0)} guests in confirmed bookings`;
    document.querySelector('#shared-empty').hidden = bookings.length > 0;
    for (const booking of bookings) {
      const row = document.createElement('tr');
      row.dataset.bookingId = booking.id;
      row.title = booking.id;
      const values = [`${booking.date} · ${booking.time}`, window.SEATSYNC_VENUES[booking.venue]?.name || booking.venue,
        booking.id.slice(0, 8), booking.guests, `Table ${booking.table}`, booking.status];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.className = 'py-4 pr-3';
        cell.textContent = value; // Never interpret browser-stored data as HTML.
        row.append(cell);
      }
      const actions = document.createElement('td');
      const future = window.SeatSyncBooking.isFuture(booking.date, booking.time);
      if (future || booking.status === 'cancelled') actions.append(link('View', 'confirmation', booking));
      if (booking.status !== 'cancelled' && future) {
        actions.append(link('Edit', 'booking', booking));
        const cancel = document.createElement('button');
        cancel.className = 'text-rose-700 font-semibold';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
          if (!confirm(`Cancel ${window.SEATSYNC_VENUES[booking.venue].name}, ${booking.date} at ${booking.time}, table ${booking.table}? No real payment is charged.`)) return;
          message.textContent = storage.cancel(booking) ? '' : 'Could not save cancellation. Please enable browser storage and try again.';
          render();
        });
        actions.append(cancel);
      }
      row.append(actions);
      rows.append(row);
    }
  }
  for (const input of [venue, date, status]) input.addEventListener('change', render);
  document.querySelector('#shared-reset').addEventListener('click', () => {
    venue.value = ''; date.value = ''; status.value = ''; search.value = ''; render();
  });
  search.addEventListener('input', render);
  window.addEventListener('storage', render);
  window.addEventListener('pageshow', render);
  render();
})();
