'use strict';
(async () => {
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
      const target = new URL(next, location.href);
      if (target.origin === location.origin && target.pathname === new URL('confirmation.html', location.href).pathname) return target.href;
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
    login.addEventListener('change', updateMode); updateMode();
    document.querySelector('#guest-continue').href = new URLSearchParams(location.search).has('next') ? nextPage() : 'booking.html';
    login.addEventListener('submit', async event => {
      event.preventDefault();
      const button = login.querySelector('button[type=submit]'); button.disabled = true;
      try {
        const result = await api.request(`/auth/${login.elements.mode.value}`, 'POST', {
          name: login.elements.name.value.trim(), email: login.elements.email.value.trim(), password: login.elements.password.value
        });
        location.href = result.user.role === 'admin' ? '../admin.dashbroad.html' : nextPage();
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
  document.querySelector('#bookings-signed-out').hidden = true;
  document.querySelector('#bookings-signed-in').hidden = false;
  function render() {
    list.replaceChildren();
    const bookings = storage.list().sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    document.querySelector('#bookings-count').textContent = `${bookings.length} bookings`;
    document.querySelector('#bookings-empty').hidden = bookings.length > 0;
    for (const booking of bookings) {
      const card = document.querySelector('#booking-template').content.cloneNode(true);
      const upcoming = window.SeatSyncBooking.isFuture(booking.date, booking.time);
      const cancelled = booking.status === 'cancelled';
      for (const [key,value] of Object.entries({venue:window.SEATSYNC_VENUES[booking.venue].name,date:booking.date,time:booking.time,guests:`${booking.guests} guests`,table:`Table ${booking.table}`,status:cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'})) card.querySelector(`[data-${key}]`).textContent = value;
      const edit = card.querySelector('[data-edit]'); edit.hidden = !upcoming || cancelled;
      edit.href = `booking.html?id=${encodeURIComponent(booking.id)}`;
      card.querySelector('[data-manage]').href = `confirmation.html?id=${encodeURIComponent(booking.id)}`;
      list.append(card);
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
