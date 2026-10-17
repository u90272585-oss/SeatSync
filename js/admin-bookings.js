'use strict';

// Malika's original components now share the customer booking records.
(async () => {
  const storage = window.SeatSyncBookingStorage;
  const rules = window.SeatSyncBooking;
  const api = window.SeatSyncAPI;
  let tables = rules.tables.map(t => ({...t}));
  try { await storage.ready; } catch { return; }
  if (window.SeatSyncAPI.user?.role !== 'admin') { location.replace('pages/account.html'); return; }
  const $ = id => document.getElementById(id);
  const venue = $('shared-venue'), date = $('shared-date'), time = $('shared-time');
  const status = $('shared-status'), search = $('searchInput');
  let selectedId = null, selectedTable = '1';
  $('admin-greeting').textContent = `Hello, ${api.user.name}`;
  $('admin-title').textContent = `Welcome, ${api.user.name}!`;
  const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const customer = booking => booking.name || `Guest · ${booking.id.slice(0, 8)}`;
  const setText = (id, value) => { if ($(id)) $(id).textContent = value; };
  const inVisit = booking => booking.status !== 'cancelled' && minute(time.value) >= minute(booking.time)
    && minute(time.value) < minute(booking.time) + 90;
  const dayBookings = () => storage.list().filter(b => b.venue === venue.value && b.date === date.value)
    .sort((a, b) => a.time.localeCompare(b.time));
  const canChange = b => b && b.status !== 'cancelled' && rules.isFuture(b.date, b.time);
  for (const [id, item] of Object.entries(window.SEATSYNC_VENUES)) venue.add(new Option(item.name, id));
  for (const table of tables.filter(t => !t.occupied)) $('custTable').add(new Option(`Table ${table.id} · ${table.seats} seats`, table.id));
  // Open on the nearest future booking when available; otherwise today's venue.
  const upcoming = storage.list().filter(b => canChange(b)).sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const initial = upcoming[0];
  venue.value = initial?.venue || 'skyberry'; date.value = initial?.date || rules.nowInAlmaty().date;
  time.value = initial?.time || '12:00'; selectedId = initial?.id || null; selectedTable = initial?.table || '1';

  function selectBooking(booking) {
    selectedId = booking.id; selectedTable = booking.table; time.value = booking.time; render();
  }
  window.selectTable = id => {
    selectedTable = String(id);
    selectedId = dayBookings().find(b => b.table === selectedTable && inVisit(b))?.id || null;
    render();
  };
  function render() {
    const bookings = dayBookings();
    const active = bookings.filter(b => b.status !== 'cancelled');
    const atTime = active.filter(inVisit);
    const reserved = new Set(atTime.map(b => b.table));
    const blocked = tables.filter(t => t.occupied).length;
    setText('metric-0', bookings.length); setText('metric-1', active.reduce((n,b) => n + Number(b.guests),0));
    setText('metric-2', reserved.size); setText('metric-3', tables.length - blocked - reserved.size);
    setText('admin-venue-name', window.SEATSYNC_VENUES[venue.value].name);
    setText('admin-date-label', date.value);
    setText('shared-summary', `${window.SEATSYNC_VENUES[venue.value].name} · ${date.value} · Floor plan at ${time.value} (Almaty). Visits last 90 minutes. Table settings apply only to this venue. Demo reservations.`);
    const visible = bookings.filter(b => (!status.value || b.status === status.value)
      && `${customer(b)} ${b.id} ${b.time} table ${b.table}`.toLowerCase().includes(search.value.toLowerCase()));
    const rows = $('bookingRows'); rows.replaceChildren();
    for (const booking of visible) {
      const row = document.createElement('tr');
      row.className = `hover:bg-slate-50/80 transition-colors ${selectedId === booking.id ? 'is-selected' : ''}`;
      row.dataset.bookingId = booking.id;
      for (const [index, value] of [booking.time, customer(booking), booking.guests, booking.table, booking.status].entries()) {
        const cell = document.createElement('td'); cell.className = 'py-2.5';
        if (index > 1) cell.classList.add('text-center');
        if (index === 1) {
          const button = document.createElement('button'); button.className = 'font-bold text-slate-800 text-left';
          button.textContent = value; button.addEventListener('click', () => selectBooking(booking)); cell.append(button);
        } else if (index === 4) {
          const pill = document.createElement('span'); pill.className = `px-2.5 py-1 rounded-full text-[11px] font-semibold ${booking.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`;
          pill.textContent = booking.status === 'cancelled' ? 'Cancelled' : 'Confirmed'; cell.append(pill);
        } else cell.textContent = value;
        row.append(cell);
      }
      const actions = document.createElement('td'), button = document.createElement('button');
      button.textContent = 'Details'; button.className = 'text-brand-600 font-semibold';
      button.addEventListener('click', () => selectBooking(booking)); actions.append(button); row.append(actions); rows.append(row);
    }
    if (!visible.length) {
      const row = rows.insertRow(), cell = row.insertCell(); cell.colSpan = 6; cell.className = 'py-8 text-center text-slate-500';
      cell.textContent = 'No bookings match this venue, date and search.';
    }
    for (const table of tables) {
      const node = $(`table-node-${table.id}`);
      const state = table.occupied ? 'unavailable' : reserved.has(table.id) ? 'reserved' : 'available';
      node.classList.remove('status-available','status-reserved','status-occupied','status-unavailable');
      node.classList.add(`status-${state}`); node.classList.toggle('active', table.id === selectedTable);
      node.setAttribute('aria-label', `Table ${table.id}, ${table.seats} seats, ${state}`);
      node.setAttribute('aria-pressed', String(table.id === selectedTable));
    }
    const table = tables.find(t => t.id === selectedTable);
    const booking = bookings.find(b => b.id === selectedId);
    if (document.activeElement !== $('table-capacity')) $('table-capacity').value = table.seats;
    $('block-table').querySelector('span').textContent = table.occupied ? 'Unblock table' : 'Block table';
    const tableState = table.occupied ? 'Unavailable' : reserved.has(table.id) ? 'Reserved' : 'Available';
    setText('selectedTableName', `Table ${table.id}`); setText('selectedTableStatus', tableState);
    $('selectedTableStatus').className = `px-2 py-0.5 rounded-full text-[10px] font-bold status-${tableState.toLowerCase()}`;
    setText('selectedTableCapacity', `${table.seats} seats`); setText('selectedTableFeature', table.name);
    setText('selectedGuestName', booking ? customer(booking) : 'No reservation selected');
    setText('selectedGuestCount', booking ? `${booking.guests} guests` : '—');
    setText('selectedTimeSlot', booking ? `${booking.date} · ${booking.time} (90 min)` : `${time.value} · Almaty time`);
    setText('selectedBookingPill', booking ? booking.status : tableState);
    $('selectedBookingPill').className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700';
    $('edit-reservation').disabled = !canChange(booking); $('cancel-reservation').disabled = !canChange(booking);
    renderList('booking-activity', bookings.slice(-3).reverse());
    renderList('upcoming-bookings', active.filter(canChange).slice(0,3));
  }
  function renderList(id, bookings) {
    const container = $(id); container.replaceChildren();
    if (!bookings.length) { container.textContent = 'No bookings for this selection.'; return; }
    for (const booking of bookings) {
      const button = document.createElement('button'); button.className = 'block w-full text-left p-2 rounded-xl hover:bg-slate-50';
      button.textContent = `${booking.time} · ${customer(booking)} · Table ${booking.table} · ${booking.status}`;
      button.addEventListener('click', () => selectBooking(booking)); container.append(button);
    }
  }
  $('edit-reservation').addEventListener('click', () => {
    const booking = storage.find(selectedId); if (!canChange(booking)) return render();
    location.href = `pages/booking.html?${new URLSearchParams({id:booking.id,venue:booking.venue,date:booking.date,time:booking.time,guests:booking.guests,table:booking.table})}`;
  });
  $('cancel-reservation').addEventListener('click', async () => {
    const booking = storage.find(selectedId); if (!canChange(booking)) return render();
    if (!confirm(`Cancel ${customer(booking)}, ${booking.date} at ${booking.time}, Table ${booking.table}? No real payment is charged.`)) return;
    $('cancel-reservation').disabled = true;
    try { await storage.cancel(booking); setText('shared-message', 'Booking cancelled.'); }
    catch (error) { setText('shared-message', error.message); }
    render();
  });
  window.openModal = () => {
    $('addBookingForm').reset(); $('custTime').value = time.value; setText('admin-form-error','');
    $('bookingModal').classList.remove('hidden'); $('custName').focus();
  };
  window.closeModal = () => $('bookingModal').classList.add('hidden');
  window.handleFormSubmit = async event => {
    event.preventDefault();
    const booking = {venue:venue.value,date:date.value,time:$('custTime').value,
      guests:$('custGuests').value,table:$('custTable').value,customer_email:$('custName').value.trim(),status:'confirmed'};
    if (!$('addBookingForm').reportValidity()) return;
    const button = $('addBookingForm').querySelector('button[type=submit]'); button.disabled = true;
    try { const saved = await storage.saveShared(booking); window.closeModal(); selectBooking(saved); }
    catch (error) { setText('admin-form-error', error.message); }
    finally { button.disabled = false; }
  };
  for (const node of document.querySelectorAll('.table-node')) {
    node.setAttribute('role','button'); node.tabIndex = 0;
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();node.click();} });
  }
  for (const control of [venue,date,time]) control.addEventListener('change', () => {
    if (!date.value) date.value = rules.nowInAlmaty().date;
    if (!time.value) time.value = '12:00';
    selectedId = null; void refresh();
  });
  $('view-all-bookings').closest('button').addEventListener('click', () => { status.value = ''; search.value = ''; render(); });
  $('list-view').addEventListener('click', () => { $('bookingsTable').scrollIntoView({behavior:'smooth',block:'center'}); search.focus(); });
  $('floor-view').addEventListener('click', () => $('floor-map').scrollIntoView({behavior:'smooth',block:'center'}));
  status.addEventListener('change',render); search.addEventListener('input',render);
  window.addEventListener('storage',render); window.addEventListener('pageshow',render);
  document.addEventListener('keydown',event => {if(event.key === 'Escape') window.closeModal();});
  window.lucide?.createIcons();
  let refreshing = false;
  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try { await storage.refresh(); await loadTables(); render(); }
    catch (error) { setText('shared-message', error.message); }
    finally { refreshing = false; }
  }
  async function loadTables() {
    const selectedVenue = venue.value;
    const result = await api.request(`/admin/tables?${new URLSearchParams({venue:selectedVenue})}`);
    if (venue.value !== selectedVenue) return;
    tables = result;
    const previous = $('custTable').value;
    $('custTable').replaceChildren(...tables.filter(t => !t.occupied).map(t => new Option(`Table ${t.id} · ${t.seats} seats`,t.id)));
    if ([...$('custTable').options].some(o => o.value === previous)) $('custTable').value = previous;
  }
  async function changeTable(change) {
    const button = $('block-table'); button.disabled = true;
    try {
      await api.request(`/admin/tables/${encodeURIComponent(venue.value)}/${encodeURIComponent(selectedTable)}`, 'PATCH', change);
      await loadTables(); render(); setText('shared-message', 'Table settings saved.');
    } catch (error) { setText('shared-message', error.message); }
    finally { button.disabled = false; }
  }
  $('block-table').addEventListener('click', () => {
    const table = tables.find(t => t.id === selectedTable);
    if (confirm(`${table.occupied ? 'Unblock' : 'Block'} table ${table.id} at ${window.SEATSYNC_VENUES[venue.value].name}?`)) void changeTable({blocked:!table.occupied});
  });
  $('save-capacity').addEventListener('click', () => {
    if ($('table-capacity').reportValidity()) void changeTable({seats:Number($('table-capacity').value)});
  });
  $('view-calendar').addEventListener('click', () => {
    date.scrollIntoView({behavior:'smooth',block:'center'}); date.focus();
    try { date.showPicker(); } catch { /* The date field remains keyboard accessible. */ }
  });
  $('header-calendar').addEventListener('click', () => $('view-calendar').click());
  $('export-report').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/admin/bookings/export', {credentials:'same-origin'});
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'seatsync-bookings.csv';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setText('shared-message','Booking report downloaded.');
    } catch (error) { setText('shared-message',error.message); }
  });
  $('admin-notifications').addEventListener('click', () => setText('shared-message', `${storage.list().filter(canChange).length} upcoming active bookings.`));
  await refresh();
  const timer = setInterval(refresh, 5000);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => clearInterval(timer));
})();
