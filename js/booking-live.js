"use strict";

(() => {
  const form = document.querySelector("#booking-form");
  const dateInput = form.elements.date;
  const timeInput = form.elements.time;
  const guestsInput = form.elements.guests;
  const tableContainer = document.querySelector("#tables");
  const error = document.querySelector("#form-error");
  const signInLink = document.querySelector("#signin-to-booking");
  const params = new URLSearchParams(location.search);
  const venueId = Object.hasOwn(window.SEATSYNC_VENUES, params.get("venue") || "")
    ? params.get("venue")
    : "cafe";
  let venueTables = [];
  let availableTableIds = new Set();
  let availabilityRequest = 0;
  let tableById = new Map();
  const selectedTableId = () =>
    tableContainer.querySelector('input[name="table"]:checked')?.value || "";

  const localDate = (value) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const dateLabel = (value) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  const formatTime = (value) => value.slice(0, 5);
  const endTimeFromStart = (value, minutes = 90) => {
    const [hours, mins] = value.split(":").map(Number);
    const total = hours * 60 + mins + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
  }

  function updateSummary() {
    const selected = tableById.get(Number(selectedTableId()));
    document.querySelector("#summary-date").textContent =
      dateInput.value ? dateLabel(dateInput.value) : "Choose a date";
    document.querySelector("#summary-time").textContent =
      timeInput.value ? formatTime(timeInput.value) : "Choose a time";
    document.querySelector("#summary-guests").textContent =
      `${guestsInput.value} ${guestsInput.value === "1" ? "guest" : "guests"}`;
    document.querySelector("#summary-table").textContent = selected
      ? `${selected.display_name} · Table ${selected.table_number}`
      : "Choose an available table";
  }

  function renderTables(availableIds = new Set()) {
    availableTableIds = availableIds;
    tableContainer.replaceChildren();
    for (const table of venueTables) {
      const label = document.createElement("label");
      label.className = "table-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "table";
      input.value = String(table.id);
      input.required = true;
      input.disabled = !availableIds.has(table.id);
      input.setAttribute(
        "aria-label",
        `Table ${table.table_number}, ${table.display_name}, up to ${table.seat_capacity} guests`,
      );
      const card = document.createElement("span");
      card.className = "table-card";
      const icon = document.createElement("span");
      icon.className = "table-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = String(table.table_number);
      const name = document.createElement("strong");
      name.textContent = table.display_name;
      const detail = document.createElement("small");
      detail.textContent = `Table ${table.table_number} · ${table.seat_capacity} seats`;
      card.append(icon, name, detail);
      label.append(input, card);
      tableContainer.append(label);
    }
    updateSummary();
  }

  function updateTimeChoices(openingHours) {
    const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(openingHours);
    if (!match) throw new Error("The venue opening hours are not configured correctly.");
    const opens = Number(match[1]) * 60 + Number(match[2]);
    const closes = Number(match[3]) * 60 + Number(match[4]);
    timeInput.replaceChildren(new Option("Choose a time", ""));
    for (let minutes = opens; minutes + 90 <= closes; minutes += 30) {
      const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      timeInput.add(new Option(value, value));
    }
    const hours = document.querySelector(".reservation-panel .field-note");
    if (hours) {
      hours.replaceChildren(
        document.createTextNode(`Open ${match[1]}:${match[2]}–${match[3]}:${match[4]}`),
        document.createElement("br"),
        document.createTextNode("Last reservation · 90-minute visit"),
      );
    }
  }

  async function refreshAvailability() {
    const requestId = ++availabilityRequest;
    const now = new Date();
    dateInput.min = localDate(now);
    if (!dateInput.value || !timeInput.value) {
      renderTables(new Set());
      return;
    }
    showError("");
    const previousId = selectedTableId();
    renderTables(new Set());
    tableContainer.setAttribute("aria-busy", "true");
    try {
      const result = await window.SEATSYNC_API.getAvailability(venueId, {
        date: dateInput.value,
        time: timeInput.value,
        guest_count: guestsInput.value,
        duration_minutes: 90,
      });
      if (requestId !== availabilityRequest) return;
      const ids = new Set(result.available_tables.map((table) => table.id));
      renderTables(ids);
      if (ids.has(Number(previousId))) {
        const restored = tableContainer.querySelector(`input[value="${CSS.escape(previousId)}"]`);
        if (restored) restored.checked = true;
      }
      if (!ids.size) showError("No tables are available for this date, time, and party size.");
    } catch (requestError) {
      if (requestId !== availabilityRequest) return;
      renderTables(new Set());
      showError(requestError.message || "Availability could not be loaded. Please try again.");
    } finally {
      if (requestId === availabilityRequest) tableContainer.removeAttribute("aria-busy");
      updateSummary();
    }
  }

  async function initialize() {
    dateInput.min = localDate(new Date());
    if (params.has("date")) dateInput.value = params.get("date");
    if (/^\d{1,2}$/.test(params.get("guests") || "")) guestsInput.value = params.get("guests");
    document.querySelector("#venue-name").textContent = window.SEATSYNC_VENUES[venueId].name;
    try {
      const [venue, tables] = await Promise.all([
        window.SEATSYNC_API.getVenue(venueId),
        window.SEATSYNC_API.getVenueTables(venueId),
      ]);
      document.querySelector("#venue-name").textContent = venue.name;
      document.querySelector(".location").lastChild.textContent = ` ${venue.location}`;
      updateTimeChoices(venue.opening_hours);
      venueTables = tables.filter((table) => table.active && !table.blocked);
      tableById = new Map(venueTables.map((table) => [table.id, table]));
      const editBookingId = params.get("id");
      if (editBookingId) {
        const booking = await window.SEATSYNC_API.getBooking(editBookingId);
        if (
          booking.venue_id !== venueId ||
          booking.status === "cancelled" ||
          booking.user_id !== JSON.parse(localStorage.getItem("seatsync.profile") || "null")?.id
        ) {
          throw new Error("This booking cannot be edited from this account.");
        }
        if (!params.has("date")) dateInput.value = booking.reservation_date;
        if (!params.has("time")) params.set("time", booking.start_time.slice(0, 5));
        if (!params.has("guests")) guestsInput.value = String(booking.guest_count);
      }
      timeInput.value = params.get("time") || "";
      await refreshAvailability();
      const requestedTable = Number(params.get("table"));
      if (requestedTable && availableTableIds.has(requestedTable)) {
        const input = tableContainer.querySelector(`input[value="${CSS.escape(String(requestedTable))}"]`);
        if (input) input.checked = true;
      }
      updateSummary();
    } catch (initializationError) {
      showError(initializationError.message || "Venue information could not be loaded.");
    }
  }

  form.addEventListener("change", (event) => {
    showError("");
    if (event.target?.name === "table") {
      updateSummary();
      return;
    }
    refreshAvailability();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    if (!form.reportValidity()) return;
    const tableId = selectedTableId();
    if (!tableId) {
      showError("Choose an available table before confirming your reservation.");
      return;
    }
    const token = localStorage.getItem("seatsync.token");
    if (!token) {
      const next = `booking.html?${new URLSearchParams({
        venue: venueId,
        date: dateInput.value,
        time: timeInput.value,
        guests: guestsInput.value,
        table: tableId,
        ...(params.get("id") ? { id: params.get("id") } : {}),
      })}`;
      signInLink.href = `account.html?${new URLSearchParams({ next })}`;
      signInLink.hidden = false;
      showError("Sign in before confirming so this reservation can be saved to your account.");
      return;
    }
    if (!availableTableIds.has(Number(tableId))) {
      showError("Choose a table that is currently available for this time.");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const payload = {
        venue_id: venueId,
        table_id: Number(tableId),
        reservation_date: dateInput.value,
        start_time: timeInput.value,
        end_time: endTimeFromStart(timeInput.value),
        guest_count: Number(guestsInput.value),
      };
      const bookingId = params.get("id");
      const saved = bookingId
        ? await window.SEATSYNC_API.updateBooking(bookingId, payload)
        : await window.SEATSYNC_API.createBooking(payload);
      location.href = `confirmation.html?id=${encodeURIComponent(saved.id)}`;
    } catch (requestError) {
      showError(requestError.message || "The reservation could not be saved.");
    } finally {
      submit.disabled = false;
    }
  });

  initialize();
})();
