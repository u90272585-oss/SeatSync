'use strict';

const params = new URLSearchParams(location.search);
const venueId = Object.hasOwn(window.SEATSYNC_VENUES, params.get('venue') || '') ? params.get('venue') : 'cafe';
document.querySelector('#venue-name').textContent = window.SEATSYNC_VENUES[venueId].name;
const date = params.get('date') || '';
const time = params.get('time') || '';
const guests = params.get('guests') || '';
const tableId = params.get('table') || '';
const tables = {
  '1': { name: 'Window nook', seats: 2 }, '2': { name: 'Coffee corner', seats: 2 },
  '3': { name: 'Garden view', seats: 4 }, '4': { name: 'Cozy booth', seats: 4 },
  '5': { name: 'The gathering', seats: 6 }, '6': { name: 'Sunshine spot', seats: 6 }
};
const table = Object.hasOwn(tables, tableId) ? tables[tableId] : null;
const parsedDate = new Date(`${date}T${time}`);
const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)
  && !Number.isNaN(parsedDate.getTime()) && parsedDate > new Date()
  && parsedDate.getFullYear() === Number(date.slice(0, 4))
  && parsedDate.getMonth() + 1 === Number(date.slice(5, 7))
  && parsedDate.getDate() === Number(date.slice(8))
  && minutes >= 540 && minutes <= 1110 && minutes % 30 === 0
  && Number(time.slice(3)) < 60 && /^[1-6]$/.test(guests)
  && table && table.seats >= Number(guests);

if (valid) {
  document.querySelector('#confirmed-date').textContent = parsedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  document.querySelector('#confirmed-time').textContent = parsedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  document.querySelector('#confirmed-guests').textContent = `${guests} ${guests === '1' ? 'guest' : 'guests'}`;
  document.querySelector('#confirmed-table').textContent = `${table.name} · Table ${tableId}`;
  document.querySelector('#edit-booking').href = `booking.html?${new URLSearchParams({ venue: venueId, date, time, guests, table: tableId })}`;
  document.querySelector('#back-booking').href = document.querySelector('#edit-booking').href;
  document.querySelector('#confirmation').hidden = false;
} else {
  document.querySelector('#empty-state').hidden = false;
}
