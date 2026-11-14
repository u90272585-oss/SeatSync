(function () {
  'use strict';
  const reader = document.querySelector('[data-menu-venue]');
  if (!reader) return;
  const menus = window.SeatSyncMenus[reader.dataset.menuVenue];
  if (!menus?.length) return;
  const select = reader.querySelector('#menu-section');
  const image = reader.querySelector('#menu-image');
  const previous = reader.querySelector('#menu-prev');
  const next = reader.querySelector('#menu-next');
  const error = reader.querySelector('#menu-error');
  let section = 0;
  let page = 0;
  function show() {
    const menu = menus[section];
    select.value = String(section);
    error.hidden = true;
    image.parentElement.classList.toggle('menu-screenshot', menu.screenshot);
    image.alt = `${menu.label}, page ${page + 1}`;
    image.src = menu.pages[page];
    const imageLink = reader.querySelector('#menu-image-link');
    if (imageLink) imageLink.href = menu.pages[page];
    reader.querySelector('#menu-position').textContent = `${section + 1} / ${menus.length} · Page ${page + 1} of ${menu.pages.length}`;
    previous.disabled = section === 0 && page === 0;
    next.disabled = section === menus.length - 1 && page === menu.pages.length - 1;
  }
  select.addEventListener('change', () => { section = Number(select.value); page = 0; show(); });
  previous.addEventListener('click', () => {
    if (page > 0) page--;
    else if (section > 0) { section--; page = menus[section].pages.length - 1; }
    show();
  });
  next.addEventListener('click', () => {
    if (page < menus[section].pages.length - 1) page++;
    else if (section < menus.length - 1) { section++; page = 0; }
    show();
  });
  image.addEventListener('error', () => { error.hidden = false; });
  show();
})();
