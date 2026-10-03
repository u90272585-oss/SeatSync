"use strict";
// Darina's homepage: section navigation and copyright.
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (target) { event.preventDefault(); target.scrollIntoView({behavior:'smooth'}); }
  });
});
const copyright = document.querySelector('.copyright');
if (copyright) copyright.textContent = `© ${new Date().getFullYear()} SeatSync`;
