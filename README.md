# SeatSync

Table reservation demo for cafés and restaurants.

## Team contributions
- Darina: homepage (`index.html`, `darina-style.css`, `darina-main.js`).
- Uldana: booking, confirmation, demo profiles and My bookings.
- Malika: owner dashboard (`pages/admin.html`).

## Run locally
```sh
python3 -m http.server 8000 --bind 127.0.0.1
```
Open http://127.0.0.1:8000/ . The homepage footer and demo profile link to the owner dashboard.

## Integrated flow
Home → Booking → Confirmation → My bookings. Saved demo bookings also appear in the dashboard’s “Bookings from the website” section in the same browser/origin. Editing a booking updates that entry. Malika’s example metrics, sample bookings, floor plan and Add Booking modal are a separate illustrative dashboard, not live restaurant availability. Old `darina-home.html` and `admin.dashbroad.html` links redirect to their canonical pages.

## Demo limitations
No real authentication, email verification, server sync or payment. Profiles and bookings use localStorage; use sample information. Anyone on the same browser can open a demo profile with the same email, or access the demo owner dashboard. Signing out retains bookings; clearing browser storage removes them. The 100 ₸ fee is illustrative. The owner dashboard requires internet access for its existing Tailwind and Lucide CDN assets; fonts and restaurant images also use external resources.
