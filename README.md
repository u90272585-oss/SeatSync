# SeatSync
Table reservation system for small cafes
Table reservation platform for cafés and restaurants


Demo profiles and My bookings use localStorage in the current browser. There is no authentication, email verification, server synchronization, payment processing, or real venue reservation. Use sample names and emails. Signing out retains bookings; clearing site storage deletes them. The same email reopens its demo bookings on the same browser.

## Booking and confirmation — Uldana, Stage 2

Run locally from the repository root with `python3 -m http.server 8000`, then open
`http://localhost:8000/pages/booking.html`. No build step, backend or package install is required.

The booking form accepts a venue, date, half-hour time slot, 1–6 guests and one table.
The venue list includes the nine Almaty names supplied by the team; categories, opening
hours, images, table layout and availability are illustrative, not verified venue data.
Legacy venue IDs remain supported for older links and saved bookings. The homepage now shows the eight venues from the supplied Instagram references.
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

### Booking terms, cancellation and Help

Before confirming, guests must explicitly accept the proposed demo terms: a 100 ₸
service fee, no extra fee for editing the same booking, no additional cancellation
fee, and no service-fee refund for guest cancellations. The proposed policy provides
a service-fee refund if the venue cancels or the booking cannot be fulfilled. These
are prototype terms, not the actual policies of the named venues. No payment/refund
integration or venue-initiated cancellation workflow is implemented.

Cancellation is available before the visit, with an informational warning when less
than 24 hours remain. Confirmation asks the user to choose Keep booking or Cancel
booking. Cancelled bookings remain in profile history and cannot be edited. The
`seatsync.booking.cancelled.v1` localStorage key keeps cancelled IDs independently
of the latest receipt, so opening an older confirmation URL cannot reactivate a
cancelled booking in the same browser. Past cancelled bookings remain viewable.

If storage is blocked, the cancellation is represented in the updated URL and a
message explains that older links may still show an active booking. This is only a
frontend demo: clearing storage, using a different browser or manually changing
local data bypasses local state; reliable cancellation needs a backend.

`js/booking-help.js` adds a keyboard-accessible Help dialog to booking, confirmation
and My bookings. It contains FAQs and navigation, not live chat. No messages are
sent and no unverified venue contacts are invented. `css/booking-actions.css` styles
the terms, consent checkbox, cancellation dialog and Help panel.

Manual checks: try submitting without consent; cancel and choose Keep booking;
confirm cancellation; reload both the updated and original URLs; create a second
booking and revisit the first; check Cancelled in My bookings; try an old edit link;
open Help, expand a question and close with Escape. Repeat with storage blocked.

### Almaty venue cards

The homepage collection contains Skyberry, AQQU, RENÉE, Benedict, SIX Coffee + Wine,
Qarlygash Cafe, Gülfairus and Procoffee. The matching search options and card links
open the existing booking form; no new venue detail pages were added. Vanilla and
legacy sample IDs remain available in the booking catalogue for compatibility.

`css/venues.css` scopes the compact collection: three columns above 1000px, two
columns on tablets, and one below 541px. Cards keep SeatSync typography and purple
accents, show each venue name once and open the existing booking form.

The eight `*-mood.jpg` covers are fictional atmosphere illustrations generated with
the built-in image_gen tool, not actual photographs of the named venues. They share
warm editorial lighting and subtle lilac/plum accents. Full prompts are recorded in
`assets/images/venues/generation-prompts.json`. JPEG encoding reduces transfer size;
images are lazy-loaded with explicit dimensions. The originals of the earlier user
reference screenshots remain available but are not loaded by these cards. Instagram
links still use the account handles visible in those references.

Reference mapping (supplied October 10, 2026):
- skyberry-reference.jpeg — skyberry.almaty
- aqqu-reference.jpeg — aqqu.cafe
- renee-reference.jpeg — renee_almaty
- benedict-reference.jpeg — benedict_almaty
- six-reference.jpeg — sixcoffeewine
- qarlygash-reference.jpeg — qarlygash_cafe
- gulfairus-reference.jpeg — gulfairus_restaurant
- procoffee-reference.jpeg — procoffee.almaty

## Combined team demonstration — October 10, 2026

Start `python3 -m http.server 8000` from the repository root.
- [Unified homepage — Darina’s design](index.html)
- [Optional team reference page](team-demo.html)
- [Darina’s original homepage](darina-home.html)
- [Uldana’s booking flow](pages/booking.html)
- [Malika’s original admin prototype](admin.dashbroad.html)

The integration preserves commit ancestry from `main` / `darina-homepage`
(`d3429e5`), `uldana-booking` (`b82658b`) and `Malika-Admin` (`a3d4ccc`).
The source branches and commit history are preserved. Darina’s booking links now
open the customer flow; her duplicate script load and empty-anchor error are fixed.

### Shared booking administration

`admin.dashbroad.html` displays a SeatSync booking journal above Malika’s original
sample dashboard (expand it to show the unchanged example cards and floor plan).
`js/admin-bookings.js` uses the existing purple design and shared storage API.

- Guest and profile bookings are stored by ID in `seatsync.bookings.shared.v1`.
- Existing profile records and the last guest receipt are migrated when saved.
- Creation, editing, cancellation, reload and other tabs use the same records.
- Venue, date and status filters are available. Admin Edit opens the customer form;
  Cancel asks for confirmation and persists cancellation in both views.
- Old confirmation URLs use the newest saved version, avoiding accidental rollback.
- The original sample floor plan and statistics remain demonstration data.
- This is a frontend demo: shared data exists only for the same browser and origin.
  It has no real restaurant connection, administrator authentication or payments.
- The original admin fonts, Tailwind and icons require internet access.

Validation: `node --test tests/*.test.cjs`. Browser checks cover the homepage links,
creation, cross-tab admin display, edits, old URLs, cancellation and mobile layout.

### Unified site entry

Open `/index.html` (or `/`). Darina’s original hero and sections are the homepage,
with the Almaty venue cards added below. The previous booking-oriented homepage
is preserved as `booking-home.html`. Account offers guest and administrator demo
roles, with switching for existing profiles. Administrator opens
`admin.dashbroad.html`; guest opens Uldana’s booking flow. All Back to Home links
return to Darina’s homepage. Demo roles are navigation, not secure authentication.
Dependent scripts use a coordinated version query to prevent mixed cached APIs.
Confirmation has a visible recovery state if scripts cannot load.
