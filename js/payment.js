'use strict';
// Payment page. Kaspi and card are simulations (their fields are decorative and never sent).
// Halyk opens the bank's real TEST payment page; the server then asks Halyk whether the invoice was paid.
(() => {
  const $ = id => document.getElementById(id);
  const api = window.SeatSyncAPI;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const halykReturn = params.get('halyk');
  const enc = encodeURIComponent(id || '');
  const SYMBOL = { KZT: '₸' };
  const METHODS = {
    kaspi: { label: 'Kaspi.kz', tag: 'Payment confirmation (demo)', kind: 'app', button: () => 'Confirm in Kaspi.kz app' },
    card:  { label: 'Bank card', tag: 'Card payment (demo)', kind: 'card', button: amount => `Pay ${amount}` }
  };
  const confirmationUrl = `confirmation.html?id=${enc}`;
  let method = null, amountText = '', deadline = 0, tick = null, busy = false;

  function show(name) {
    document.querySelectorAll('[data-state]').forEach(section => { section.hidden = section.dataset.state !== name; });
    $('pay-summary').hidden = !(name === 'methods' || name === 'bank');
  }
  function setLoading(text) { document.querySelector('[data-state="loading"] p').textContent = text; }
  function showNote(text) { const note = $('methods-note'); note.textContent = text; note.hidden = !text; }
  function fail(message) { clearInterval(tick); $('pay-error-text').textContent = message; show('error'); }
  function fmt(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function prettyDate(value) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#pay-now, [data-outcome], [data-method-choice]').forEach(button => { button.disabled = value; });
  }
  function done() {
    clearInterval(tick);
    $('pay-continue').href = confirmationUrl;
    show('paid');
    setTimeout(() => { location.href = confirmationUrl; }, 1800);
  }

  function startTimer(seconds) {
    clearInterval(tick);
    deadline = performance.now() + seconds * 1000;
    const render = () => {
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      $('pay-timer').textContent = fmt(left);
      $('pay-timer').classList.toggle('pay-urgent', left <= 60);
      if (left === 0) { clearInterval(tick); refresh(); }
    };
    render();
    tick = setInterval(render, 500);
  }

  // Ask the server for the real state. The server decides when time has run out.
  async function refresh() {
    try {
      const { payment } = await api.request(`/bookings/${enc}/payment`);
      if (!payment || payment.status === 'paid') { location.replace(confirmationUrl); return; }
      if (payment.status === 'expired') { clearInterval(tick); show('expired'); return; }
      if (payment.secondsLeft <= 0) { setTimeout(refresh, 1000); return; }
      startTimer(payment.secondsLeft);
    } catch (error) { fail(error.message); }
  }

  async function fillSummary(booking, payment) {
    let venue = booking.venue, table = booking.table;
    try { const venues = await api.request('/venues'); venue = (venues.find(v => v.id === booking.venue) || {}).name || venue; } catch {}
    try {
      const query = new URLSearchParams({ venue: booking.venue, date: booking.date, time: booking.time });
      const tables = await api.request(`/availability?${query}`);
      table = (tables.find(t => t.id === booking.table) || {}).name || table;
    } catch {}
    amountText = `${payment.amount} ${SYMBOL[payment.currency] || payment.currency}`;
    $('pay-venue').textContent = venue;
    $('pay-date').textContent = prettyDate(booking.date);
    $('pay-time').textContent = booking.time;
    $('pay-guests').textContent = `${booking.guests} guest${booking.guests === '1' ? '' : 's'}`;
    $('pay-table').textContent = table;
    $('pay-amount').textContent = amountText;
  }

  function openBank(key) {
    method = key;
    const info = METHODS[key];
    showNote('');
    $('pay-bank').dataset.method = key;
    $('bank-name').textContent = info.label;
    $('bank-tag').textContent = info.tag;
    $('bank-amount').textContent = amountText;
    $('bank-card-form').hidden = info.kind !== 'card';
    $('bank-app').hidden = info.kind !== 'app';
    $('pay-now').textContent = info.button(amountText);
    $('bank-error').hidden = true;
    show('bank');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-halyk]')) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src; script.dataset.halyk = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the Halyk payment form. Check your internet connection.'));
      document.head.append(script);
    });
  }

  // Real Halyk TEST flow: the server gets a token from the bank, the bank's own page takes the (test) card.
  async function startHalyk() {
    if (busy) return;
    setBusy(true); showNote('');
    setLoading('Opening the Halyk test payment page…'); show('loading');
    try {
      const data = await api.request(`/bookings/${enc}/payment/halyk/start`, 'POST', {});
      await loadScript(data.script);
      if (!window.halyk || typeof window.halyk.pay !== 'function') throw new Error('The Halyk payment form could not be loaded.');
      window.halyk.pay(data.payment);
    } catch (error) {
      setBusy(false); show('methods'); showNote(error.message);
      if (error.status === 409) refresh();
    }
  }

  // After the bank sends the customer back, never trust the browser: the server asks Halyk.
  async function verifyHalyk() {
    setLoading('Confirming your payment with Halyk…'); show('loading');
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const data = await api.request(`/bookings/${enc}/payment/halyk/verify`, 'POST', {});
        if (data.result === 'paid') { done(); return; }
      } catch (error) {
        if (error.status !== 502) { show('methods'); showNote(error.message); refresh(); return; }
      }
      await wait(2000);
    }
    show('methods');
    showNote('We could not confirm the Halyk payment yet. Wait a moment and try Halyk again, or choose another method.');
  }

  async function pay(outcome) {
    if (busy || !method) return;
    setBusy(true);
    $('bank-error').hidden = true;
    try {
      const { payment } = await api.request(`/bookings/${enc}/payment/pay`, 'POST', { method, outcome });
      if (payment.status === 'paid') done(); else { clearInterval(tick); show('expired'); }
    } catch (error) {
      $('bank-error').textContent = error.message;
      $('bank-error').hidden = false;
      if (error.status !== 402) await refresh();
    } finally { setBusy(false); }
  }

  async function load() {
    if (!id) { fail('This payment link is incomplete. Open your booking from My bookings.'); return; }
    try {
      const user = await api.ready;
      const link = document.querySelector('[data-account-link]');
      if (link && user) { link.textContent = 'My bookings'; link.href = 'my-bookings.html'; }
      if (!user) { location.href = `account.html?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      const [booking, result] = await Promise.all([
        api.request(`/bookings/${enc}`),
        api.request(`/bookings/${enc}/payment`)
      ]);
      const payment = result.payment;
      if (!payment || payment.status === 'paid') { location.replace(confirmationUrl); return; }
      if (payment.status === 'expired') { show('expired'); return; }
      await fillSummary(booking, payment);
      startTimer(payment.secondsLeft);
      history.replaceState(null, '', `payment.html?id=${enc}`);
      if (halykReturn === 'return') { await verifyHalyk(); return; }
      show('methods');
      if (halykReturn === 'failed') showNote('Halyk did not complete the payment. You can try again or choose another method before the timer ends.');
    } catch (error) { fail(error.message); }
  }

  document.querySelectorAll('[data-method-choice]').forEach(button =>
    button.addEventListener('click', () => {
      if (button.dataset.methodChoice === 'halyk') startHalyk(); else openBank(button.dataset.methodChoice);
    }));
  $('pay-now').addEventListener('click', () => pay('success'));
  document.querySelectorAll('[data-outcome]').forEach(button =>
    button.addEventListener('click', () => pay(button.dataset.outcome)));
  $('pay-back').addEventListener('click', () => show('methods'));
  load();
})();
