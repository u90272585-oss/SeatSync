"use strict";

(() => {
  const params = new URLSearchParams(location.search);
  const confirmation = document.querySelector("#confirmation");
  const emptyState = document.querySelector("#empty-state");

  async function initialize() {
    const bookingId = params.get("id");
    if (!bookingId || !localStorage.getItem("seatsync.token")) {
      emptyState.hidden = false;
      return;
    }
    try {
      const booking = await window.SEATSYNC_API.getBooking(bookingId);
      if (booking.status !== "confirmed") {
        throw new Error("This reservation is no longer confirmed.");
      }
      const [venue, tables] = await Promise.all([
        window.SEATSYNC_API.getVenue(booking.venue_id),
        window.SEATSYNC_API.getVenueTables(booking.venue_id),
      ]);
      const table = tables.find((item) => item.id === booking.table_id);
      const start = new Date(`${booking.reservation_date}T${booking.start_time}`);
      document.querySelector("#venue-name").textContent = venue.name;
      document.querySelector(".ticket-heading .eyebrow").lastChild.textContent =
        ` ${venue.location}`;
      document.querySelector("#confirmed-date").textContent = start.toLocaleDateString("en-US", {
        weekday: "short", month: "long", day: "numeric", year: "numeric",
      });
      document.querySelector("#confirmed-time").textContent = booking.start_time.slice(0, 5);
      document.querySelector("#confirmed-guests").textContent =
        `${booking.guest_count} ${booking.guest_count === 1 ? "guest" : "guests"}`;
      document.querySelector("#confirmed-table").textContent = table
        ? `${table.display_name} · Table ${table.table_number}`
        : `Table ${booking.table_id}`;
      document.querySelector("#save-status").textContent =
        `Reservation ${booking.id} is confirmed in SeatSync.`;
      const editUrl = `booking.html?${new URLSearchParams({
        venue: booking.venue_id,
        date: booking.reservation_date,
        time: booking.start_time.slice(0, 5),
        guests: String(booking.guest_count),
        table: String(booking.table_id),
        id: booking.id,
      })}`;
      document.querySelector("#edit-booking").href = editUrl;
      document.querySelector("#back-booking").href = editUrl;
      confirmation.hidden = false;
    } catch (error) {
      const description = emptyState.querySelector(".muted");
      description.textContent = error.message || "Reservation details could not be verified.";
      emptyState.hidden = false;
    }
  }

  initialize();
})();
