'use strict';

const tables = [
  { id: '1', name: 'Window nook', seats: 2, shape: 'round' },
  { id: '2', name: 'Coffee corner', seats: 2, shape: 'round' },
  { id: '3', name: 'Garden view', seats: 4, shape: '' },
  { id: '4', name: 'Cozy booth', seats: 4, shape: '' },
  { id: '5', name: 'The gathering', seats: 6, shape: 'long' },
  { id: '6', name: 'Sunshine spot', seats: 6, shape: 'long' }
];
const form = document.querySelector('#booking-form');
const dateInput = form.elements.date;
const timeInput = form.elements.time;
const guestsInput = form.elements.guests;
const error = document.querySelector('#form-error');
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeLabel = (time) => new Date(`2000-01-01T${time}`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

for (let minutes = 540; minutes <= 1110; minutes += 30) {
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  timeInput.add(new Option(timeLabel(value), value));
}
document.querySelector('#tables').innerHTML = tables.map(table => `
  <label class="table-option"><input type="radio" name="table" value="${table.id}" required aria-label="Table ${table.id}, ${table.name}, up to ${table.seats} guests">
  <span class="table-card"><span class="table-icon ${table.shape}" aria-hidden="true">${table.id}</span><strong>${table.name}</strong><small>Table ${table.id} · ${table.seats} seats</small></span></label>
`).join('') + '<div class="occupied-table" aria-label="Table 7, occupied"><span class="table-icon" aria-hidden="true">7</span><strong>Table 7</strong><small>Occupied</small></div><div class="occupied-table" aria-label="Table 8, occupied"><span class="table-icon round" aria-hidden="true">8</span><strong>Table 8</strong><small>Occupied</small></div>';

// Query parameters keep the flow functional even when browser storage is disabled.
const params = new URLSearchParams(location.search);
const venueId = Object.hasOwn(window.SEATSYNC_VENUES, params.get('venue') || '') ? params.get('venue') : 'cafe';
document.querySelector('#venue-name').textContent = window.SEATSYNC_VENUES[venueId].name;
if (params.has('date')) {
  dateInput.value = params.get('date');
  timeInput.value = params.get('time') || '';
  if (/^[1-6]$/.test(params.get('guests'))) guestsInput.value = params.get('guests');
  const restored = [...form.elements.table].find(input => input.value === params.get('table'));
  if (restored) restored.checked = true;
}

function update() {
  const now = new Date();
  dateInput.min = localDate(now);
  for (const option of timeInput.options) {
    if (option.value) option.disabled = Boolean(dateInput.value) && new Date(`${dateInput.value}T${option.value}`) <= now;
  }
  if (timeInput.selectedOptions[0]?.disabled) timeInput.value = '';
  for (const input of form.elements.table) {
    input.disabled = tables.find(table => table.id === input.value).seats < Number(guestsInput.value);
    if (input.disabled) input.checked = false;
  }
  const selected = tables.find(table => table.id === form.elements.table.value);
  document.querySelector('#summary-date').textContent = dateInput.value ? dateLabel(dateInput.value) : 'Choose a date';
  document.querySelector('#summary-time').textContent = timeInput.value ? timeLabel(timeInput.value) : 'Choose a time';
  document.querySelector('#summary-guests').textContent = `${guestsInput.value} ${guestsInput.value === '1' ? 'guest' : 'guests'}`;
  document.querySelector('#summary-table').textContent = selected ? `Table ${selected.id} · ${selected.name}` : 'Choose a table';
}
form.addEventListener('change', () => { error.hidden = true; update(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  update();
  if (!form.reportValidity()) return;
  if (new Date(`${dateInput.value}T${timeInput.value}`) <= new Date()) {
    error.textContent = 'Please choose a future date and time.';
    error.hidden = false;
    dateInput.focus();
    return;
  }
  const booking = new URLSearchParams({ venue: venueId, date: dateInput.value, time: timeInput.value, guests: guestsInput.value, table: form.elements.table.value });
  const existingId = params.get('id');
  booking.set('id', /^[a-zA-Z0-9-]{10,80}$/.test(existingId || '') ? existingId : crypto.randomUUID());
  location.href = `confirmation.html?${booking.toString()}`;
});
update();
