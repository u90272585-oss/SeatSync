'use strict';
// Darina's discovery interactions, integrated with the shared venue catalog.
(() => {
  const cards = [...document.querySelectorAll('.venue-discovery .almaty-card')];
  if (!cards.length) return;
  const search = document.querySelector('#restaurant-search');
  const filters = [...document.querySelectorAll('[data-category]')];
  const key = 'seatsync.favorite-venues.v1';
  let favorites = new Set(), category = 'all';
  try { const stored = JSON.parse(localStorage.getItem(key)); if (Array.isArray(stored)) favorites = new Set(stored.filter(v => typeof v === 'string')); } catch {}
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const card of cards) {
    const id = new URL(card.querySelector('.venue-book-link').href).searchParams.get('venue');
    const venue = window.SEATSYNC_VENUES[id];
    card.dataset.venue = id;
    card.dataset.category = id === 'benedict' ? 'breakfast' : ['gulfairus','qarlygash'].includes(id) ? 'restaurant' : 'cafe';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'favorite-btn';
    button.addEventListener('click', () => {
      favorites.has(id) ? favorites.delete(id) : favorites.add(id);
      try { localStorage.setItem(key, JSON.stringify([...favorites])); } catch {}
      render();
    });
    card.append(button);
    const map = document.createElement('a');
    map.className = 'venue-map-link'; map.textContent = 'Find on Google Maps ↗';
    map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' Almaty')}`;
    map.target = '_blank'; map.rel = 'noopener noreferrer';
    card.querySelector('.almaty-card-body').append(map);
  }
  function render() {
    let count = 0;
    for (const card of cards) {
      const id = card.dataset.venue, venue = window.SEATSYNC_VENUES[id];
      const saved = favorites.has(id), button = card.querySelector('.favorite-btn');
      button.textContent = saved ? '♥' : '♡'; button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${venue.name} ${saved ? 'from' : 'to'} favorites`);
      card.hidden = !(category === 'all' || category === 'favorites' && saved || card.dataset.category === category)
        || !normalize(`${venue.name} ${venue.type}`).includes(normalize(search.value.trim()));
      if (!card.hidden) count++;
    }
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    document.querySelector('#discovery-results').textContent = `${count} ${count === 1 ? 'place' : 'places'}${category === 'favorites' ? ' in your favorites on this device' : ' to explore'}`;
    document.querySelector('#discovery-empty').hidden = count > 0;
  }
  search.addEventListener('input', render);
  document.querySelector('#clear-search').addEventListener('click', () => { search.value = ''; render(); search.focus(); });
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.category; render(); }));
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    try { const data = JSON.parse(event.newValue); favorites = new Set(Array.isArray(data) ? data : []); render(); } catch {}
  });
  render();
})();
