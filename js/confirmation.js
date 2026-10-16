'use strict';
(async () => {
  const rules=window.SeatSyncBooking, storage=window.SeatSyncBookingStorage;
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let id=params.get('id'),booking;
  if(!id)try{id=sessionStorage.getItem('seatsync.lastBookingId');}catch{}
  function failure(error) {
    $('confirmation').hidden=true; $('empty-state').hidden=false;
    $('empty-state').querySelector('p').textContent=error.message;
  }
  function render() {
    const venue=window.SEATSYNC_VENUES[booking.venue],table=rules.tables.find(t=>t.id===booking.table);
    const cancelled=booking.status==='cancelled',future=rules.isFuture(booking.date,booking.time);
    history.replaceState(null,'',`confirmation.html?${new URLSearchParams({id:booking.id})}`);
    $('venue-name').textContent=venue.name; $('confirmed-reference').textContent=booking.id;
    $('confirmed-date').textContent=new Date(`${booking.date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'long',day:'numeric',year:'numeric'});
    $('confirmed-time').textContent=`${booking.time} · Almaty time`;
    $('confirmed-guests').textContent=`${booking.guests} ${booking.guests==='1'?'guest':'guests'}`;
    $('confirmed-table').textContent=`${table.name} · Table ${booking.table}`;
    $('confirmation-title').textContent=cancelled?'Your booking is cancelled':'Your table is booked!';
    $('confirmation-intro').textContent=cancelled?'Your cancellation is saved on the server.':'Your booking is saved on the server. No real restaurant reservation or payment is made.';
    $('booking-status').textContent=cancelled?'Cancelled · Demo':'Confirmed · Demo';
    $('booking-status').classList.toggle('cancelled-badge',cancelled);
    $('edit-booking').href=`booking.html?${new URLSearchParams({id:booking.id})}`;
    $('edit-booking').hidden=cancelled||!future; $('cancel-booking').hidden=cancelled||!future;
    $('back-booking').href='../index.html';$('back-booking').textContent='← Back to Home';
    document.querySelector('.success-mark').textContent=cancelled?'×':'✓';
    $('receipt-status').textContent='Saved in the SeatSync database.';
    $('save-status').textContent=window.SeatSyncAPI.user?'Sign in to the same account on another device to see your bookings.':'Guest access is linked to this browser session. Register or sign in here to keep these bookings in your account.';
    $('saved-bookings-link').textContent='My bookings';$('saved-bookings-link').href='my-bookings.html';
    document.querySelectorAll('[data-account-link]').forEach(link=>{if(!window.SeatSyncAPI.user)link.href=`account.html?${new URLSearchParams({next:`confirmation.html?id=${booking.id}`})}`;});
    $('empty-state').hidden=true;$('confirmation').hidden=false;
  }
  try {
    await storage.ready;
    if(!id)throw new Error('No booking selected. Create a booking or open My bookings.');
    booking=await storage.load(id);render();
  }catch(error){failure(error);return;}
  $('cancel-booking').addEventListener('click',()=>{
    $('cancel-summary').textContent=`${window.SEATSYNC_VENUES[booking.venue].name} · ${booking.date} · ${booking.time} · Table ${booking.table}`;
    const now=rules.nowInAlmaty();
    const hoursLeft=(new Date(`${booking.date}T${booking.time}:00Z`)-new Date(`${now.date}T${now.time}:00Z`))/3600000;
    $('late-cancellation').hidden=hoursLeft>=24;$('cancel-error').hidden=true;$('cancel-dialog').showModal();
  });
  $('keep-booking').addEventListener('click',()=>$('cancel-dialog').close());
  $('confirm-cancel').addEventListener('click',async()=>{
    $('confirm-cancel').disabled=true;
    try{booking=await storage.cancel(booking);render();$('cancel-dialog').close();$('confirmation-title').tabIndex=-1;$('confirmation-title').focus();}
    catch(error){$('cancel-error').textContent=error.message;$('cancel-error').hidden=false;}
    finally{$('confirm-cancel').disabled=false;}
  });
  let refreshing=false;
  async function refresh(){
    if(refreshing||document.hidden||$('cancel-dialog').open)return;
    refreshing=true;
    try{booking=await storage.load(id);render();$('cancellation-status').hidden=true;}
    catch(error){if(error.status===404)failure(error);else{$('cancellation-status').textContent=error.message;$('cancellation-status').hidden=false;}}
    finally{refreshing=false;}
  }
  const poll=setInterval(refresh,5000);
  window.addEventListener('focus',refresh);window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
})();
