'use strict';

// A memory cache for rendering only. The server database is the source of truth.
window.SeatSyncBookingStorage = (() => {
  const api = window.SeatSyncAPI;
  let records = [];
  function remember(booking) {
    const index=records.findIndex(item=>item.id===booking.id);
    if(index<0)records.push(booking);else records[index]=booking;
    window.dispatchEvent(new Event('bookings-updated'));
    return booking;
  }
  async function refresh() { records=await api.request('/bookings'); return records; }
  const ready=api.ready.then(refresh);
  ready.catch(error => { const note = document.createElement('p'); note.className = 'notice'; note.setAttribute('role', 'alert'); note.textContent = error.message; document.querySelector('main')?.prepend(note); });
  async function load(id) { return remember(await api.request(`/bookings/${encodeURIComponent(id)}`)); }
  async function saveShared(booking) {
    await ready;
    const existing=booking.id && records.find(item=>item.id===booking.id);
    if (booking.id && !existing) throw new Error("Load the booking before editing it.");
    const result=existing
      ? await api.request(`/bookings/${encodeURIComponent(existing.id)}`,'PUT',{...booking,version:booking.version ?? existing.version})
      : await api.request('/bookings','POST',booking);
    try {sessionStorage.setItem('seatsync.lastBookingId',result.id);}catch{}
    return remember(result);
  }
  async function cancel(booking) {
    await ready;
    return remember(await api.request(`/bookings/${encodeURIComponent(booking.id)}/cancel`,'POST',{}));
  }
  function find(id) { return records.find(item=>item.id===id)||null; }
  return {ready,refresh,load,saveShared,cancel,find,list:()=>records.slice(),isCancelled:id=>find(id)?.status==='cancelled'};
})();
