'use strict';
(async () => {
  const passwordInput = document.querySelector('#signin-password');
  const passwordToggle = document.querySelector('#password-toggle');
  if (passwordInput && passwordToggle) {
    const setPasswordVisible = visible => {
      passwordInput.type = visible ? 'text' : 'password';
      const label = visible ? 'Hide password' : 'Show password';
      passwordToggle.setAttribute('aria-label', label);
      passwordToggle.title = label;
      passwordToggle.classList.toggle('is-visible', visible);
    };
    passwordToggle.hidden = false;
    passwordToggle.addEventListener('click', () => setPasswordVisible(passwordInput.type === 'password'));
    document.querySelectorAll('input[name="mode"]').forEach(input => {
      input.addEventListener('change', () => setPasswordVisible(false));
    });
    passwordInput.form.addEventListener('submit', () => setPasswordVisible(false));
    window.addEventListener('pagehide', () => setPasswordVisible(false));
  }
  const api = window.SeatSyncAPI;
  const storage = window.SeatSyncBookingStorage;
  const prefix = location.pathname.includes('/pages/') ? '' : 'pages/';
  const notify = (element, text) => { element.textContent = text; element.hidden = false; };
  window.SeatSyncAccount = { profile: () => api.user, bookings: () => storage.list() };
  try { await storage.ready; } catch { return; }
  const user = api.user;
  document.querySelectorAll('[data-account-link]').forEach(link => {
    link.textContent = user ? `◉ ${user.name.split(/\s+/)[0]}` : 'Sign in / Register';
    link.href = `${prefix}account.html`;
  });
  document.querySelectorAll('[data-demo-role="admin"], a[href="../admin.dashbroad.html"]').forEach(link => {
    link.hidden = user?.role !== 'admin';
  });
  function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    if (next) {
      let target;
      try { target = new URL(next, location.href); } catch { return 'my-bookings.html'; }
      if (target.origin === location.origin && ['/pages/booking.html', '/pages/confirmation.html', '/pages/my-bookings.html'].includes(target.pathname)) return target.href;
    }
    return 'my-bookings.html';
  }
  const login = document.querySelector('#demo-signin');
  if (login) {
    document.querySelector('#signin-section').hidden = Boolean(user);
    document.querySelector('#profile-section').hidden = !user;
    const updateMode = () => {
      const register = login.elements.mode.value === 'register';
      login.elements.name.required = register;
      login.elements.name.closest('.name-field').hidden = !register;
      login.elements.password.autocomplete = register ? 'new-password' : 'current-password';
      login.querySelector('button[type=submit]').textContent = register ? 'Create account →' : 'Sign in →';
    };
    if (new URLSearchParams(location.search).get('mode') === 'register') login.elements.mode.value = 'register';
    login.addEventListener('change', updateMode); updateMode();
    if (user && new URLSearchParams(location.search).has('next')) { location.replace(nextPage()); return; }
    login.addEventListener('submit', async event => {
      event.preventDefault();
      const button = login.querySelector('button[type=submit]'); button.disabled = true;
      try {
        const result = await api.request(`/auth/${login.elements.mode.value}`, 'POST', {
          name: login.elements.name.value.trim(), email: login.elements.email.value.trim(), password: login.elements.password.value
        });
        location.href = new URLSearchParams(location.search).has('next') ? nextPage() : result.user.role === 'admin' ? '../admin.dashbroad.html' : nextPage();
      } catch (error) { notify(document.querySelector('#signin-message'), error.message); }
      finally { button.disabled = false; }
    });
    if (user) {
      document.querySelector('#current-role').textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
      document.querySelector('#welcome-name').textContent = user.name;
      document.querySelector('#profile-name').value = user.name;
      document.querySelector('#profile-email').value = user.email;
      document.querySelector('#profile-count').textContent = storage.list().length;
    }
    document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => {
      location.href = button.dataset.demoRole === 'admin' ? '../admin.dashbroad.html' : 'booking.html';
    }));
    document.querySelector('#profile-form').addEventListener('submit', async event => {
      event.preventDefault();
      try { await api.request('/profile', 'PATCH', { name: document.querySelector('#profile-name').value.trim() }); location.reload(); }
      catch (error) { notify(document.querySelector('#profile-message'), error.message); }
    });
    document.querySelector('#signout').addEventListener('click', async () => {
      try { await api.request('/auth/logout', 'POST', {}); location.href = 'account.html'; }
      catch (error) { notify(document.querySelector('#profile-message'), error.message); }
    });
  }
  const list = document.querySelector('#booking-list');
  if (!list) return;
  if (!user) return;
  document.querySelector('#bookings-signed-out').hidden = true;
  document.querySelector('#bookings-signed-in').hidden = false;
  async function loadPayment(bookingId) {
    try { const data = await api.request(`/bookings/${encodeURIComponent(bookingId)}/payment`); return data.payment || null; }
    catch (error) { if (error.status === 404) return null; throw error; }
  }
  const METHOD_LABEL = { halyk: 'Halyk test', kaspi: 'Kaspi demo', card: 'Card demo' };
  function applyPayment(card, payment, cancelled, upcoming) {
    const badge = card.querySelector('[data-status]');
    const feeLine = card.querySelector('#fee-line');
    const payBtn = card.querySelector('[data-pay]');
    const editBtn = card.querySelector('[data-edit]');
    if (!payment) return;
    if (payment.status === 'paid') {
      badge.textContent = `Paid · ${METHOD_LABEL[payment.method] || payment.method || 'demo'}`;
      if (feeLine) feeLine.innerHTML = `Service fee <strong>${payment.amount} ${payment.currency}</strong><small>Paid via ${METHOD_LABEL[payment.method] || payment.method}</small>`;
      return;
    }
    if (payment.status === 'pending' && !cancelled) {
      badge.textContent = 'Awaiting payment';
      if (feeLine) feeLine.innerHTML = `Service fee <strong>${payment.amount} ${payment.currency}</strong><small>Payment pending</small>`;
      if (payBtn) { payBtn.hidden = false; payBtn.href = `payment.html?id=${encodeURIComponent(payment.bookingId)}`; }
      if (editBtn) editBtn.hidden = true;
      return;
    }
    if (payment.status === 'expired' || (payment.status === 'pending' && cancelled)) {
      badge.textContent = 'Released (time ran out)';
      if (feeLine) feeLine.innerHTML = `Service fee <strong>${payment.amount} ${payment.currency}</strong><small>Released after 10-minute hold</small>`;
      if (payBtn) payBtn.hidden = true;
      if (editBtn) editBtn.hidden = true;
    }
  }
  async function render() {
    list.replaceChildren();

    const bookings = storage.list().sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    document.querySelector('#bookings-count').textContent = `${bookings.length} bookings`;
    document.querySelector('#bookings-empty').hidden = bookings.length > 0;
    const pending = [];
    for (const booking of bookings) {
      const card = document.querySelector('#booking-template').content.cloneNode(true);
      const upcoming = window.SeatSyncBooking.isFuture(booking.date, booking.time);
      const cancelled = booking.status === 'cancelled';
      for (const [key,value] of Object.entries({venue:window.SEATSYNC_VENUES[booking.venue].name,date:booking.date,time:booking.time,guests:`${booking.guests} guests`,table:`Table ${booking.table}`,status:cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'})) card.querySelector(`[data-${key}]`).textContent = value;
      const edit = card.querySelector('[data-edit]'); edit.hidden = !upcoming || cancelled;
      edit.href = `booking.html?id=${encodeURIComponent(booking.id)}`;
      card.querySelector('[data-manage]').href = `confirmation.html?id=${encodeURIComponent(booking.id)}`;
      list.append(card);
      pending.push((async () => {
        try { const payment = await loadPayment(booking.id); applyPayment(card, payment, cancelled, upcoming); }
        catch (error) { /* keep base badge if payment lookup fails */ }
      })());
    }
    await Promise.all(pending);
    const badge = document.querySelector('#bookings-badge');
    if (badge) {
      const anyPending = bookings.some(b => b.status === 'confirmed') && list.querySelectorAll('[data-status]').length && Array.from(list.querySelectorAll('[data-pay]')).some(p => !p.hidden);
      badge.textContent = anyPending ? 'Action needed' : 'Demo';
    }
  }
  render();
  let busy = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try { await storage.refresh(); render(); }
    catch (error) { document.querySelector('#bookings-count').textContent = error.message; }
    finally { busy = false; }
  }
  const timer = setInterval(refresh, 5000);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => clearInterval(timer));
})();
