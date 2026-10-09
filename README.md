# SeatSync
Table reservation platform for cafés and restaurants


Demo profiles and My bookings use localStorage in the current browser. There is no authentication, email verification, server synchronization, payment processing, or real venue reservation. Use sample names and emails. Signing out retains bookings; clearing site storage deletes them. The same email reopens its demo bookings on the same browser.

## Booking and confirmation — Uldana, Stage 2

Run locally from the repository root with `python3 -m http.server 8000`, then open
`http://localhost:8000/pages/booking.html`. No build step, backend or package install is required.

The booking form accepts a venue, date, half-hour time slot, 1–6 guests and one table.
The venue list includes the nine Almaty names supplied by the team; categories, opening
hours, images, table layout and availability are illustrative, not verified venue data.
Existing homepage venue IDs remain supported. The homepage is unchanged.
Teammates can link cards to `pages/booking.html?venue=skyberry` (from the root page).
Other new IDs: `vanilla`, `aqqu`, `renee`, `benedict`, `six`, `qarlygash`, `gulfairus`, `procoffee`.

- `js/booking.js` fills the form, restores a draft, updates the table states and summary,
  validates submission, and opens confirmation using URL query parameters.
- `js/booking-rules.js` contains the demo tables, time slots and validation shared by
  both pages. Dates/times are checked in `Asia/Almaty`, regardless of device timezone.
- `js/booking-storage.js` stores the latest confirmed booking without requiring a
  profile. Storage errors are caught; the URL remains a fallback.
- `js/confirmation.js` validates URL data (or the latest saved confirmation when no
  query is supplied), displays it with `textContent`, and builds Edit Booking links.
  Editing retains the booking ID so profile history updates rather than duplicates.

Storage keys are `seatsync.booking.draft.v1` and `seatsync.booking.confirmed.v1`.
Explicit booking links take priority over drafts. Invalid confirmation links show an
empty state; they do not silently display an older saved booking. Confirmation saves
only one latest receipt for guests; the existing profile feature maintains its list.
This frontend does not lock tables, synchronize users or send reservations to cafés.

Run validation tests with `node --test tests/*.test.cjs`.
For manual checking: book a table for two, change to six guests (the small table must
clear), select table 5, confirm, reload, edit and confirm again. Check My bookings with
a demo profile: the same booking ID should appear once. Also try a past date, occupied
table IDs 7/8 in a URL, a malformed URL, blocked storage and a narrow mobile viewport.
