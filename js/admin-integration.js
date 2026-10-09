"use strict";
(() => {
  const key = 'seatsync.demo.bookings.v1';
  function render() {
    const tbody = document.querySelector('#live-booking-rows');
    const message = document.querySelector('#live-message');
    tbody.replaceChildren();
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      const rows = Array.isArray(stored) ? stored.filter(b => b && Object.hasOwn(window.SEATSYNC_VENUES, b.venue) && typeof b.date === 'string' && typeof b.time === 'string') : [];
      rows.sort((a,b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      message.textContent = rows.length ? `${rows.length} saved demo booking(s). Refresh or book in another tab to see changes.` : 'No saved website bookings yet. Sign in to a demo profile, then confirm a booking.';
      rows.forEach(b => {
        const tr = document.createElement('tr');
        [window.SEATSYNC_VENUES[b.venue].name,b.date,b.time,b.name || 'Demo guest',b.guests,`Table ${b.table}`].forEach(value => {
          const td = document.createElement('td'); td.textContent = String(value ?? ''); tr.append(td);
        });
        tbody.append(tr);
      });
    } catch { message.textContent = 'Browser storage is unavailable or invalid. The sample dashboard below is still available.'; }
  }
  document.querySelector('#refresh-live').addEventListener('click',render);
  window.addEventListener('storage',event => { if (event.key === key) render(); });
  render();
})();
