'use strict';
(async () => {
  const rules=window.SeatSyncBooking, storage=window.SeatSyncBookingStorage;
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let id=params.get('id'),booking,payment=null;
  if(!id)try{id=sessionStorage.getItem('seatsync.lastBookingId');}catch{}
  function failure(error) {
    $('confirmation').hidden=true; $('empty-state').hidden=false;
    $('empty-state').querySelector('p').textContent=error.message;
  }
  async function loadPayment(bookingId) {
    try { const data=await window.SeatSyncAPI.request(`/bookings/${encodeURIComponent(bookingId)}/payment`); return data.payment||null; }
    catch(error){ if(error.status===404)return null; throw error; }
  }
  const METHOD_LABEL={halyk:'Halyk ePay (test)',kaspi:'Kaspi (demo)',card:'Bank card (demo)'};
  function renderPayment(p) {
    const title=$('payment-summary-title'),detail=$('payment-summary-detail'),box=$('payment-summary');
    if(!p){ box.hidden=true; return; }
    if(p.status==='paid'){
      title.textContent='Paid';
      detail.textContent=`${p.amount} ${p.currency} · via ${METHOD_LABEL[p.method]||p.method}. ${p.method==='halyk'?'Test card in the bank sandbox — no real money moved.':'Simulated on this demo site — no real money moved.'}`;
      box.hidden=false;
      return;
    }
    if(p.status==='expired'){
      title.textContent='Released — time ran out';
      detail.textContent='The 10-minute hold ended before payment, so the table was released. Book again to try.';
      box.hidden=false;
      return;
    }
    box.hidden=true;
  }
  function render() {
    const venue=window.SEATSYNC_VENUES[booking.venue],table=rules.tables.find(t=>t.id===booking.table);
    const cancelled=booking.status==='cancelled',future=rules.isFuture(booking.date,booking.time);
    if(payment && payment.status==='pending' && !cancelled){
      location.replace(`payment.html?${new URLSearchParams({id:booking.id})}`);
      return;
    }
    history.replaceState(null,'',`confirmation.html?${new URLSearchParams({id:booking.id})}`);
    $('venue-name').textContent=venue.name; $('confirmed-reference').textContent=booking.id;
    $('confirmed-date').textContent=new Date(`${booking.date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'long',day:'numeric',year:'numeric'});
    $('confirmed-time').textContent=`${booking.time} · Almaty time`;
    $('confirmed-guests').textContent=`${booking.guests} ${booking.guests==='1'?'guest':'guests'}`;
    $('confirmed-table').textContent=`${table.name} · Table ${booking.table}`;
    $('confirmation-title').textContent=cancelled?'Your booking is cancelled':'Your table is booked!';
    $('confirmation-intro').textContent=cancelled?'Your cancellation is saved on the server.':'Your booking is saved on the server.';
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
    renderPayment(payment);
    $('empty-state').hidden=true;$('confirmation').hidden=false;
  }
  try {
    await storage.ready;
    if(!id)throw new Error('No booking selected. Create a booking or open My bookings.');
    booking=await storage.load(id);
    try{ payment=await loadPayment(booking.id); }catch(error){ payment=null; }
    render();
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
    try{booking=await storage.cancel(booking);try{payment=await loadPayment(booking.id);}catch(error){payment=null;}render();$('cancel-dialog').close();$('confirmation-title').tabIndex=-1;$('confirmation-title').focus();}
    catch(error){$('cancel-error').textContent=error.message;$('cancel-error').hidden=false;}
    finally{$('confirm-cancel').disabled=false;}
  });
  let refreshing=false;
  async function refresh(){
    if(refreshing||document.hidden||$('cancel-dialog').open)return;
    refreshing=true;
    try{booking=await storage.load(id);try{payment=await loadPayment(booking.id);}catch(error){payment=null;}render();$('cancellation-status').hidden=true;}
    catch(error){if(error.status===404)failure(error);else{$('cancellation-status').textContent=error.message;$('cancellation-status').hidden=false;}}
    finally{refreshing=false;}
  }
  const poll=setInterval(refresh,5000);
  window.addEventListener('focus',refresh);window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
})();
