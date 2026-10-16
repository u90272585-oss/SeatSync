'use strict';
(async () => {
const submit = document.querySelector('#booking-form [type=submit]');
submit.disabled = true;
try { await window.SeatSyncBookingStorage.ready; } catch (error) {
  const message = document.querySelector('#form-error'); message.textContent = error.message; message.hidden = false; return;
}

const rules = window.SeatSyncBooking;
const tables = rules.tables;
const form = document.querySelector('#booking-form');
const dateInput = form.elements.date;
const timeInput = form.elements.time;
const guestsInput = form.elements.guests;
const venueInput = form.elements.venue;
const venueCover = document.querySelector('#venue-cover');
const venueCoverNote = document.querySelector('#venue-cover-note');
// The brandbook background remains visible if a venue has no image or loading fails.
venueCover.addEventListener('error', () => {
  venueCover.hidden = true;
  venueCoverNote.hidden = true;
});
const draftStatus = document.querySelector('#draft-status');
const draftKey = 'seatsync.booking.draft.v1';
for (const [id, venue] of Object.entries(window.SEATSYNC_VENUES)) {
  venueInput.add(new Option(venue.name, id));
}
const error = document.querySelector('#form-error');
const timeLabel = (time) => new Date(`2000-01-01T${time}`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

for (const time of rules.times) timeInput.add(new Option(timeLabel(time), time));
document.querySelector('#tables').innerHTML = tables.map(table => `
  <label class="table-option"><input type="radio" name="table" value="${table.id}" required aria-label="Table ${table.id}, ${table.name}, up to ${table.seats} guests" aria-describedby="table-state-${table.id}">
  <span class="table-card"><span class="table-icon ${table.shape}" aria-hidden="true">${table.id}</span><strong>${table.name}</strong><small>Table ${table.id} · ${table.seats} seats</small><small id="table-state-${table.id}" class="table-state"></small></span></label>
`).join('');

// IDs identify saved server bookings. Query fields alone cannot create a confirmation.
const params = new URLSearchParams(location.search);
// Explicit links (including Edit Booking) take priority over a browser draft.
let initial = params;
if (!location.search) {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey));
    if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
      initial = new URLSearchParams(draft);
      draftStatus.textContent = 'Your unfinished booking was restored. Review the details.';
    }
  } catch {
    draftStatus.textContent = 'Draft storage is unavailable. You can still book in this tab.';
  }
}
let editingVersion;
if (initial.get('id')) {
  try {
    const record = await window.SeatSyncBookingStorage.load(initial.get('id'));
    editingVersion = record.version;
    initial = new URLSearchParams(record);
  } catch (problem) { error.textContent = problem.message; error.hidden = false; return; }
}
let requestSequence = 0;
let availabilityPending = false;
venueInput.value = Object.hasOwn(window.SEATSYNC_VENUES, initial.get('venue') || '') ? initial.get('venue') : 'skyberry';
dateInput.value = initial.get('date') || '';
timeInput.value = initial.get('time') || '';
if (/^[1-6]$/.test(initial.get('guests'))) guestsInput.value = initial.get('guests');
const restored = [...form.elements.table].find(input => input.value === initial.get('table'));
if (restored) restored.checked = true;

function saveDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify({
      venue: venueInput.value, date: dateInput.value, time: timeInput.value,
      guests: guestsInput.value, table: form.elements.table.value, id: initial.get('id') || ''
    }));
    draftStatus.textContent = 'Draft saved in this browser.';
  } catch {
    draftStatus.textContent = 'Draft could not be saved. You can still continue to confirmation.';
  }
}

async function update() {
  const sequence = ++requestSequence;
  let availability = null;
  availabilityPending = true; submit.disabled = true;
  if (dateInput.value && timeInput.value) {
    try {
      const query = new URLSearchParams({venue:venueInput.value,date:dateInput.value,time:timeInput.value});
      if (initial.get('id')) query.set('exclude',initial.get('id'));
      availability = await window.SeatSyncAPI.request(`/availability?${query}`);
    } catch (problem) {
      if (sequence !== requestSequence) return;
      error.textContent = problem.message; error.hidden = false;
      for (const input of form.elements.table) input.disabled = true;
      availabilityPending = false; return;
    }
  }
  if (sequence !== requestSequence) return;
  availabilityPending = false;
  const venue = window.SEATSYNC_VENUES[venueInput.value];
  document.querySelector('#venue-name').textContent = venue.name;
  if (venueCover.dataset.venue !== venueInput.value) {
    venueCover.dataset.venue = venueInput.value;
    venueCover.hidden = !venue.image;
    venueCoverNote.hidden = !venue.image;
    if (venue.image) venueCover.src = `../${venue.image}`;
    else venueCover.removeAttribute('src');
  }
  const now = new Date();
  dateInput.min = rules.nowInAlmaty(now).date;
  for (const option of timeInput.options) {
    if (option.value) option.disabled = Boolean(dateInput.value) && !rules.isFuture(dateInput.value, option.value, now);
  }
  if (timeInput.selectedOptions[0]?.disabled) timeInput.value = '';
  let selectionRemoved = false;
  for (const input of form.elements.table) {
    const table = tables.find(table => table.id === input.value);
    const reserved = availability && !availability.find(item => item.id === table.id)?.available;
    input.disabled = !availability || Boolean(table.occupied) || reserved || table.seats < Number(guestsInput.value);
    if (input.disabled && input.checked) { input.checked = false; selectionRemoved = true; }
    input.closest('.table-option').classList.toggle('is-occupied', Boolean(table.occupied || reserved));
    document.querySelector(`#table-state-${table.id}`).textContent = table.occupied ? 'Unavailable (demo)' : !availability ? 'Choose date and time' : reserved ? 'Reserved' : input.disabled ? 'Too small' : input.checked ? 'Selected' : 'Available';
  }
  const availableCount = [...form.elements.table].filter(input => !input.disabled).length;
  document.querySelector('#table-status').textContent = `${selectionRemoved ? 'Your previous table is unavailable for this selection. Please choose again. ' : ''}${availableCount} tables available for this selection. Checked with the server.`;
  const selected = tables.find(table => table.id === form.elements.table.value);
  document.querySelector('#summary-date').textContent = dateInput.value ? dateLabel(dateInput.value) : 'Choose a date';
  document.querySelector('#summary-time').textContent = timeInput.value ? timeLabel(timeInput.value) : 'Choose a time';
  document.querySelector('#summary-guests').textContent = `${guestsInput.value} ${guestsInput.value === '1' ? 'guest' : 'guests'}`;
  document.querySelector('#summary-table').textContent = selected ? `Table ${selected.id} · ${selected.name}` : 'Choose a table';
  submit.disabled = blockCancelledEdit();
}
form.addEventListener('change', async event => {
  error.hidden = true;
  if (blockCancelledEdit()) return;
  if (event.target === venueInput) {
    for (const input of form.elements.table) input.checked = false;
  }
  await update();
  saveDraft();
});
function blockCancelledEdit() {
  if (!window.SeatSyncBookingStorage.isCancelled(initial.get('id')) && initial.get('status') !== 'cancelled') return false;
  error.textContent = 'This booking was cancelled. ';
  const restart = document.createElement('a');
  restart.href = 'booking.html?new=1';
  restart.textContent = 'Start a new booking';
  error.append(restart);
  error.hidden = false;
  form.querySelector('[type="submit"]').disabled = true;
  return true;
}
window.addEventListener('storage', blockCancelledEdit);
window.addEventListener('pageshow', blockCancelledEdit);

function bookingDetails() {
  return { venue: venueInput.value, date: dateInput.value, time: timeInput.value,
    guests: guestsInput.value, table: form.elements.table.value };
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (availabilityPending || submit.disabled || blockCancelledEdit()) return;
  const problem = rules.validate(bookingDetails());
  for (const input of [venueInput, dateInput, timeInput, guestsInput, ...form.elements.table]) {
    input.removeAttribute('aria-invalid');
  }
  if (problem) {
    error.textContent = problem.message;
    error.hidden = false;
    const input = problem.field === 'table' ? [...form.elements.table].find(input => !input.disabled) : form.elements[problem.field];
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    return;
  }
  const consent = form.elements.terms;
  if (!consent.checked) {
    error.textContent = 'Please read and accept the booking and cancellation terms.';
    error.hidden = false;
    consent.focus();
    return;
  }
  submit.disabled = true;
  try {
    const data = bookingDetails();
    if (initial.get('id')) { data.id = initial.get('id'); data.version = editingVersion; }
    const saved = await window.SeatSyncBookingStorage.saveShared(data);
    try { localStorage.removeItem(draftKey); } catch {}
    location.href = `confirmation.html?${new URLSearchParams({id:saved.id})}`;
  } catch (problem) {
    await update(); error.textContent = problem.message; error.hidden = false;
  }

});
await update();
blockCancelledEdit();
})();
