"use strict";
(() => {
  const profileKey = 'seatsync.demo.profile.v1';
  const bookingsKey = 'seatsync.demo.bookings.v1';
  const inPages = location.pathname.includes('/pages/');
  const prefix = inPages ? '' : 'pages/';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const profile = () => {
    const value = read(profileKey, null);
    return value && typeof value.name === 'string' && typeof value.email === 'string'
      && value.name.length <= 60 && value.email.length <= 254 ? value : null;
  };
  const records = () => {
    const value = read(bookingsKey, []);
    return Array.isArray(value) ? value.filter(b => b && typeof b.id === 'string' && typeof b.email === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && /^\d{2}:\d{2}$/.test(b.time)
      && /^[1-6]$/.test(String(b.table)) && /^[1-6]$/.test(String(b.guests))
      && Object.hasOwn(window.SEATSYNC_VENUES || {}, b.venue)) : [];
  };
  const notify = (element, text) => { element.textContent = text; element.hidden = false; };
  function renderHeader() {
    const user = profile();
    document.querySelectorAll('[data-account-link]').forEach(link => {
      link.textContent = user ? `◉ ${user.name.split(/\s+/)[0]}` : 'Sign in / Register';
      link.href = `${prefix}account.html`;
      link.setAttribute('aria-label', user ? 'Open your profile' : 'Sign in to demo profile');
    });
  }
  window.SeatSyncAccount = {
    profile,
    bookings: () => records().filter(b => b.email === profile()?.email)
      .map(b => ({ ...b, ...(window.SeatSyncBookingStorage?.find(b.id) || {}), email: b.email })),
    saveBooking(booking) {
      const user = profile();
      if (!user) return false;
      const all = records();
      const index = all.findIndex(b => b.id === booking.id && b.email === user.email);
      const cancelled = all[index]?.status === 'cancelled' || window.SeatSyncBookingStorage?.isCancelled(booking.id);
      const record = {...booking, status: cancelled ? 'cancelled' : booking.status || 'confirmed', email: user.email};
      if (index >= 0) all[index] = record; else all.push(record);
      localStorage.setItem(bookingsKey, JSON.stringify(all));
      return true;
    }
  };
  renderHeader();
  const loginForm = document.querySelector('#demo-signin');
  const profileSection = document.querySelector('#profile-section');
  function renderAccount() {
    if (!loginForm) return;
    const user = profile();
    document.querySelector('#signin-section').hidden = Boolean(user);
    profileSection.hidden = !user;
    if (user) {
      const roleLabel = document.querySelector('#current-role');
      if (roleLabel) roleLabel.textContent = user.role === 'admin' ? 'Administrator' : 'Guest';
      document.querySelector('#profile-name').value = user.name;
      document.querySelector('#profile-email').value = user.email;
      document.querySelector('#welcome-name').textContent = user.name;
      document.querySelector('#profile-count').textContent = String(window.SeatSyncAccount.bookings().length);
    }
  }
  function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    if (!next) return 'booking.html';
    try {
      const target = new URL(next, location.href);
      const allowedPath = new URL('confirmation.html', location.href).pathname;
      return target.origin === location.origin && target.pathname === allowedPath ? target.href : 'my-bookings.html';
    } catch { return 'my-bookings.html'; }
  }
  if (loginForm) {
    renderAccount();
    loginForm.addEventListener('change', () => {
      loginForm.querySelector('button[type=submit]').textContent = loginForm.elements.role.value === 'admin' ? 'Continue as administrator →' : 'Continue as guest →';
    });
    document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => {
      const user = profile();
      if (!user) return;
      const role = button.dataset.demoRole === 'admin' ? 'admin' : 'guest';
      try {
        localStorage.setItem(profileKey, JSON.stringify({ ...user, role }));
        location.href = role === 'admin' ? '../admin.dashbroad.html' : nextPage();
      } catch { notify(document.querySelector('#role-message'), 'Could not save your role. Please enable browser storage.'); }
    }));
    if (new URLSearchParams(location.search).has('next')) {
      document.querySelector('#guest-continue').href = nextPage();
    }
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      const name = loginForm.elements.name.value.trim();
      const email = loginForm.elements.email.value.trim().toLowerCase();
      const message = document.querySelector('#signin-message');
      if (!name || !loginForm.reportValidity()) { notify(message, 'Please enter your name and a valid email.'); return; }
      try {
        const role = loginForm.elements.role.value === 'admin' ? 'admin' : 'guest';
        localStorage.setItem(profileKey, JSON.stringify({name, email, role}));
        location.href = role === 'admin' ? '../admin.dashbroad.html' : nextPage();
      } catch { notify(message, 'Your browser could not save this demo profile. Allow local storage and try again.'); }
    });
    document.querySelector('#profile-form').addEventListener('submit', event => {
      event.preventDefault();
      const user = profile();
      const name = document.querySelector('#profile-name').value.trim();
      const message = document.querySelector('#profile-message');
      if (!user || !name) { notify(message, 'Please enter your name.'); return; }
      try {
        localStorage.setItem(profileKey, JSON.stringify({...user,name}));
        renderAccount(); renderHeader(); notify(message, 'Profile updated in this browser.');
      } catch { notify(message, 'Your browser could not save the change. Please try again.'); }
    });
    document.querySelector('#signout').addEventListener('click', () => {
      try { localStorage.removeItem(profileKey); location.href = 'account.html'; }
      catch { notify(document.querySelector('#profile-message'), 'Could not sign out. Please check your browser storage settings.'); }
    });
  }
  const bookingList = document.querySelector('#booking-list');
  if (bookingList) {
    const user = profile();
    document.querySelector('#bookings-signed-out').hidden = Boolean(user);
    document.querySelector('#bookings-signed-in').hidden = !user;
    if (!user) return;
    const bookings = window.SeatSyncAccount.bookings().sort((a,b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    document.querySelector('#bookings-empty').hidden = bookings.length > 0;
    document.querySelector('#bookings-count').textContent = `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`;
    for (const booking of bookings) {
      const card = document.querySelector('#booking-template').content.cloneNode(true);
      const when = new Date(`${booking.date}T12:00:00Z`);
      const upcoming = window.SeatSyncBooking.isFuture(booking.date, booking.time);
      const cancelled = booking.status === 'cancelled' || window.SeatSyncBookingStorage.isCancelled(booking.id);
      card.querySelector('[data-venue]').textContent = window.SEATSYNC_VENUES[booking.venue].name;
      card.querySelector('[data-date]').textContent = when.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
      card.querySelector('[data-time]').textContent = booking.time;
      card.querySelector('[data-guests]').textContent = `${booking.guests} ${Number(booking.guests) === 1 ? 'guest' : 'guests'}`;
      card.querySelector('[data-table]').textContent = `Table ${booking.table}`;
      card.querySelector('[data-status]').textContent = cancelled ? 'Cancelled · Demo' : upcoming ? 'Upcoming · Demo' : 'Past · Demo';
      const edit = card.querySelector('[data-edit]');
      edit.hidden = !upcoming || cancelled;
      edit.href = `booking.html?${new URLSearchParams({venue:booking.venue,date:booking.date,time:booking.time,guests:booking.guests,table:booking.table,id:booking.id})}`;
      const manage = card.querySelector('[data-manage]');
      manage.hidden = !upcoming && !cancelled;
      manage.textContent = cancelled ? 'View cancellation' : 'View / Cancel booking';
      manage.href = `confirmation.html?${new URLSearchParams({venue:booking.venue,date:booking.date,time:booking.time,guests:booking.guests,table:booking.table,id:booking.id,status:cancelled ? 'cancelled' : 'confirmed'})}`;
      bookingList.append(card);
    }
  }
})();
