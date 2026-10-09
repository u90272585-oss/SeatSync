'use strict';

// One source for demo tables, time slots and validation on both booking pages.
window.SeatSyncBooking = (() => {
  const tables = [
    { id: '1', name: 'Window nook', seats: 2, shape: 'round' },
    { id: '2', name: 'Coffee corner', seats: 2, shape: 'round' },
    { id: '3', name: 'Garden view', seats: 4, shape: '' },
    { id: '4', name: 'Cozy booth', seats: 4, shape: '' },
    { id: '5', name: 'The gathering', seats: 6, shape: 'long' },
    { id: '6', name: 'Sunshine spot', seats: 6, shape: 'long' },
    { id: '7', name: 'Table 7', seats: 4, shape: '', occupied: true },
    { id: '8', name: 'Table 8', seats: 2, shape: 'round', occupied: true }
  ];
  const times = [];
  for (let minutes = 540; minutes <= 1110; minutes += 30) {
    times.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  // Venue time stays the same even when the visitor's device is abroad.
  function nowInAlmaty(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
  }
  function isDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }
  function isFuture(date, time, now = new Date()) {
    const current = nowInAlmaty(now);
    return `${date}T${time}` > `${current.date}T${current.time}`;
  }
  function validate(booking, now = new Date()) {
    if (!booking || !Object.hasOwn(window.SEATSYNC_VENUES, booking.venue || '')) {
      return { field: 'venue', message: 'Please choose a café or restaurant.' };
    }
    if (!isDate(booking.date) || booking.date < nowInAlmaty(now).date) {
      return { field: 'date', message: 'Please choose today or a future date.' };
    }
    if (!times.includes(booking.time) || !isFuture(booking.date, booking.time, now)) {
      return { field: 'time', message: 'Choose a future time between 09:00 and 18:30 (Almaty time).' };
    }
    if (!/^[1-6]$/.test(String(booking.guests))) {
      return { field: 'guests', message: 'Please choose between 1 and 6 guests.' };
    }
    const table = tables.find(item => item.id === booking.table);
    if (!table || table.occupied || table.seats < Number(booking.guests)) {
      return { field: 'table', message: 'Please select an available table with enough seats for your group.' };
    }
    return null;
  }
  return { tables, times, nowInAlmaty, isDate, isFuture, validate };
})();
