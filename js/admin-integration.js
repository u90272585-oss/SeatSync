"use strict";

(() => {
  const shell = document.querySelector(".admin-shell");
  const toast = document.querySelector("#adminToast");
  const state = { authorized: false, user: null, bookings: [], tables: [], stats: {}, selectedTableId: null };
  const statusLabels = { confirmed: "Confirmed", pending: "Pending", cancelled: "Cancelled" };
  const statusClasses = {
    confirmed: "admin-status-confirmed",
    pending: "admin-status-pending",
    cancelled: "admin-status-cancelled",
  };

  function notify(text, isError = false) {
    if (!toast) return;
    toast.textContent = text;
    toast.className = `admin-toast show ${isError ? "error" : "success"}`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.className = "admin-toast"; }, 3500);
  }

  function showAccessMessage(text, showLink = false) {
    let panel = document.querySelector("#admin-access-message");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "admin-access-message";
      panel.className = "account-card";
      panel.style.cssText = "max-width:640px;margin:4rem auto;padding:2rem;text-align:center";
      document.body.append(panel);
    }
    panel.replaceChildren();
    const heading = document.createElement("h1");
    heading.textContent = "SeatSync administration";
    const description = document.createElement("p");
    description.textContent = text;
    panel.append(heading, description);
    if (showLink) {
      const link = document.createElement("a");
      link.className = "button";
      link.href = "../pages/account.html";
      link.textContent = "Sign in";
      panel.append(link);
    }
  }

  function displayTableId(booking) {
    return Number(booking.table_id);
  }

  function normalizeBooking(booking) {
    return {
      ...booking,
      guestName: booking.guest_name || booking.guest_email || "Customer",
      email: booking.guest_email || "",
      date: booking.reservation_date,
      time: booking.start_time.slice(0, 5),
      guests: booking.guest_count,
      table: booking.table_number,
      status: statusLabels[booking.status] || booking.status,
      venue: booking.venue_id,
      venueName: booking.venue_name || booking.venue_id,
    };
  }

  function bookingRows() {
    const tbody = document.querySelector("#bookingRows");
    if (!tbody) return;
    tbody.replaceChildren();
    if (!state.bookings.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No reservations match the current search or filters.";
      row.append(cell);
      tbody.append(row);
      return;
    }
    for (const booking of state.bookings) {
      const row = document.createElement("tr");
      row.dataset.id = booking.id;
      row.className = "hover:bg-slate-50/80 transition-colors";
      for (const [value, className] of [
        [booking.time, "py-2.5"],
        [booking.guestName, "py-2.5 font-bold text-slate-800"],
        [String(booking.guests), "py-2.5 text-center"],
        [String(booking.table), "py-2.5 text-center"],
      ]) {
        const cell = document.createElement("td");
        cell.className = className;
        cell.textContent = value;
        row.append(cell);
      }
      const statusCell = document.createElement("td");
      statusCell.className = "py-2.5 text-center";
      const status = document.createElement("span");
      status.className = `admin-status-pill ${statusClasses[booking.status.toLowerCase()] || "admin-status-pending"}`;
      status.textContent = booking.status;
      statusCell.append(status);
      row.append(statusCell);
      const actions = document.createElement("td");
      actions.className = "py-2.5 text-right";
      for (const [action, text] of [["edit", "Edit"], ["cancel", "Cancel"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `admin-row-action${action === "cancel" ? " danger" : ""}`;
        button.dataset.action = action;
        button.dataset.id = booking.id;
        button.textContent = text;
        actions.append(button);
      }
      row.append(actions);
      tbody.append(row);
    }
  }

  function liveBookingRows() {
    const tbody = document.querySelector("#live-booking-rows");
    if (!tbody) return;
    tbody.replaceChildren();
    for (const booking of state.bookings) {
      const row = document.createElement("tr");
      const values = [
        booking.venue_name,
        booking.reservation_date,
        booking.start_time.slice(0, 5),
        booking.guest_name,
        booking.guest_count,
        `Table ${booking.table_number}`,
        statusLabels[booking.status] || booking.status,
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "");
        row.append(cell);
      }
      tbody.append(row);
    }
  }

  function tableInfo(table) {
    const booking = state.bookings.find((item) =>
      Number(item.table_id) === table.id && item.status !== "Cancelled",
    );
    if (booking) {
      return {
        status: booking.status === "Confirmed" ? "Reserved" : "Pending",
        color: booking.status === "Confirmed" ? "admin-status-reserved" : "admin-status-pending",
        guest: booking.guestName,
        bookingId: booking.id,
      };
    }
    return {
      status: table.blocked || !table.active ? "Unavailable" : "Available",
      color: table.blocked || !table.active ? "admin-status-unavailable" : "admin-status-available",
      guest: table.blocked ? table.block_reason || "Blocked" : "No booking",
      bookingId: null,
    };
  }

  function renderTables() {
    const list = document.querySelector("#tableListView");
    if (list) {
      list.replaceChildren();
      for (const table of state.tables) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.selectTable = String(table.id);
        button.className = "w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white text-left hover:bg-slate-50";
        const label = document.createElement("span");
        label.className = "font-bold text-sm text-slate-800";
        label.textContent = `${table.venue_name} · Table ${table.table_number} (${table.display_name})`;
        const info = tableInfo(table);
        const status = document.createElement("span");
        status.className = `admin-status-pill ${info.color}`;
        status.textContent = info.status;
        button.append(label, status);
        list.append(button);
      }
    }
    document.querySelectorAll(".table-node").forEach((node) => {
      const table = state.tables.find((item) => item.id === Number(node.dataset.tableId));
      if (!table) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      const info = tableInfo(table);
      node.setAttribute("aria-label", `${table.venue_name}, table ${table.table_number}, ${info.status}`);
      node.classList.remove("status-available", "status-occupied", "status-reserved", "status-unavailable");
      node.classList.add(info.color.replace("admin-status-", "status-"));
    });
    renderSelectedTable();
  }

  function renderSelectedTable() {
    const table = state.tables.find((item) => item.id === state.selectedTableId);
    const info = table ? tableInfo(table) : null;
    const fields = {
      selectedTableName: table ? `${table.venue_name} · Table ${table.table_number}` : "Select a table",
      selectedTableStatus: info?.status || "Unavailable",
      selectedTableType: "Indoor",
      selectedTableCapacity: table ? `${table.seat_capacity} seats` : "—",
      selectedTableFeature: table ? table.display_name : "—",
      selectedGuestName: info?.guest || "—",
      selectedGuestCount: info?.bookingId ? `${state.bookings.find((booking) => booking.id === info.bookingId).guest_count} guests` : "0 guests",
      selectedTimeSlot: info?.bookingId ? state.bookings.find((booking) => booking.id === info.bookingId).start_time.slice(0, 5) : "No reservation",
      selectedBookingPill: info?.status || "Unavailable",
    };
    for (const [id, value] of Object.entries(fields)) {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    }
    const edit = document.getElementById("editSelectedReservationBtn");
    const cancel = document.getElementById("cancelSelectedReservationBtn");
    if (edit) edit.disabled = !info?.bookingId;
    if (cancel) cancel.disabled = !info?.bookingId;
    const block = document.getElementById("blockTableBtn");
    if (block) {
      block.disabled = !table || Boolean(info?.bookingId);
      const text = block.querySelector("span");
      if (text) text.textContent = table?.blocked ? "Unblock table" : "Block table";
    }
  }

  function renderStats() {
    const values = {
      "total-bookings": state.stats.total_bookings,
      "total-guests": state.stats.total_guests,
      "tables-occupied": state.tables.filter((table) =>
        state.bookings.some((booking) => Number(booking.table_id) === table.id && booking.status !== "Cancelled"),
      ).length,
      "tables-available": state.stats.active_tables,
    };
    for (const [key, value] of Object.entries(values)) {
      const element = document.querySelector(`[data-metric="${key}"]`);
      if (element) element.textContent = String(value ?? 0);
    }
    const label = document.querySelector('[data-metric="tables-available"]')?.parentElement?.querySelector(".text-\\[11px\\]");
    if (label) label.textContent = `of ${state.tables.length}`;
  }

  async function loadTables() {
    const response = await window.SEATSYNC_API.adminTables();
    state.tables = response.tables;
    if (!state.tables.some((table) => table.id === state.selectedTableId)) {
      state.selectedTableId = state.tables[0]?.id ?? null;
    }
    renderTables();
    populateModalTables();
  }

  let searchTimer;
  let bookingRequest = 0;
  function scheduleBookingRefresh() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void refreshBookings().catch((error) => notify(error.message, true));
    }, 250);
  }

  async function refreshBookings() {
    const requestId = ++bookingRequest;
    const search = document.querySelector("#searchInput")?.value.trim() || "";
    const status = document.querySelector("#adminStatusFilter")?.value || "all";
    const date = document.querySelector("#adminDateFilter")?.value || "";
    const query = { page_size: 100, search, date };
    if (status !== "all") query.status = status.toLowerCase();
    const result = await window.SEATSYNC_API.adminBookings(query);
    if (requestId !== bookingRequest) return;
    state.bookings = result.bookings.map(normalizeBooking);
    bookingRows();
    liveBookingRows();
    renderTables();
    const liveMessage = document.querySelector("#live-message");
    if (liveMessage) liveMessage.textContent = `${result.total} reservation(s) in SeatSync.`;
  }

  async function refreshAll() {
    try {
      const [stats] = await Promise.all([
        window.SEATSYNC_API.adminStats(),
        refreshBookings(),
        loadTables(),
      ]);
      state.stats = stats;
      renderStats();
    } catch (error) {
      notify(error.message || "SeatSync data could not be refreshed.", true);
    }
  }

  function openModal(mode = "add", bookingId = null) {
    const form = document.querySelector("#addBookingForm");
    const modal = document.querySelector("#bookingModal");
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!form || !modal) return;
    form.reset();
    form.dataset.bookingId = booking?.id || "";
    document.querySelector("#bookingModal h3").textContent = booking ? "Edit Reservation" : "Add New Reservation";
    document.querySelector("#custName").value = booking?.guestName || "";
    document.querySelector("#custEmail").value = booking?.guest_email || "";
    document.querySelector("#custDate").value = booking?.reservation_date || new Date().toISOString().slice(0, 10);
    document.querySelector("#custTime").value = booking?.start_time.slice(0, 5) || "19:00";
    document.querySelector("#custGuests").value = String(booking?.guest_count || 2);
    document.querySelector("#custVenue").value = booking?.venue_id || "cafe";
    document.querySelector("#custStatus").value = booking?.status.toLowerCase() || "confirmed";
    populateModalTables(booking?.table_id);
    modal.classList.remove("hidden");
  }

  function populateModalTables(selectedTableId = null) {
    const venueSelect = document.querySelector("#custVenue");
    const tableSelect = document.querySelector("#custTable");
    if (!venueSelect || !tableSelect) return;
    const tables = state.tables.filter((table) => table.venue_id === venueSelect.value);
    tableSelect.replaceChildren(...tables.map((table) =>
      new Option(`Table ${table.table_number} · ${table.display_name}`, String(table.id)),
    ));
    if (selectedTableId && tables.some((table) => table.id === selectedTableId)) {
      tableSelect.value = String(selectedTableId);
    }
  }

  async function saveBooking(event) {
    event.preventDefault();
    const form = document.querySelector("#addBookingForm");
    if (!form.reportValidity()) return;
    const venueId = document.querySelector("#custVenue").value;
    const startTime = document.querySelector("#custTime").value;
    const [hours, minutes] = startTime.split(":").map(Number);
    const endMinutes = hours * 60 + minutes + 90;
    const payload = {
      venue_id: venueId,
      table_id: Number(document.querySelector("#custTable").value),
      reservation_date: document.querySelector("#custDate").value,
      start_time: startTime,
      end_time: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
      guest_count: Number(document.querySelector("#custGuests").value),
    };
    const bookingId = form.dataset.bookingId;
    const status = document.querySelector("#custStatus").value;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (bookingId) {
        await window.SEATSYNC_API.updateAdminBooking(bookingId, { ...payload, status });
      } else {
        payload.guest_email = document.querySelector("#custEmail").value.trim().toLowerCase();
        if (status === "cancelled") {
          throw new Error("Create a booking first, then cancel it if needed.");
        }
        await window.SEATSYNC_API.createAdminBooking(payload);
      }
      document.querySelector("#bookingModal").classList.add("hidden");
      await refreshAll();
      notify(bookingId ? "Reservation updated." : "Reservation created.");
    } catch (error) {
      notify(error.message || "The reservation could not be saved.", true);
    } finally {
      submit.disabled = false;
    }
  }

  async function cancelBooking(bookingId) {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || !window.confirm(`Cancel the reservation for ${booking.guestName}?`)) return;
    try {
      await window.SEATSYNC_API.cancelAdminBooking(bookingId);
      await refreshAll();
      notify("Reservation cancelled.");
    } catch (error) {
      notify(error.message || "The reservation could not be cancelled.", true);
    }
  }

  async function toggleTableBlock() {
    const table = state.tables.find((item) => item.id === state.selectedTableId);
    if (!table) return;
    try {
      await window.SEATSYNC_API.updateAdminTable(table.id, {
        blocked: !table.blocked,
        block_reason: table.blocked ? null : "Blocked by administrator",
      });
      await refreshAll();
      notify(table.blocked ? "Table is available again." : "Table blocked.");
    } catch (error) {
      notify(error.message || "The table status could not be changed.", true);
    }
  }

  function downloadCsv(csvText) {
    const url = URL.createObjectURL(new Blob([csvText], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `seatsync-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function interceptEvents() {
    document.addEventListener("input", (event) => {
      if (event.target?.id !== "searchInput") return;
      event.stopImmediatePropagation();
      scheduleBookingRefresh();
    }, true);
    document.addEventListener("change", (event) => {
      if (!["adminStatusFilter", "adminDateFilter"].includes(event.target?.id)) return;
      event.stopImmediatePropagation();
      scheduleBookingRefresh();
    }, true);

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const action = target.closest("[data-action]");
      const open = target.closest("[data-open-modal]");
      const close = target.closest("[data-close-modal]");
      const tableNode = target.closest(".table-node, [data-select-table]");
      const control = target.closest("button");
      const knownButton = control && (
        control.matches("[data-action], [data-open-modal], [data-close-modal], [data-select-table]") ||
        ["addBookingBtn", "viewAllBookingsBtn", "editSelectedReservationBtn", "cancelSelectedReservationBtn",
          "blockTableBtn", "viewCalendarBtn", "exportReportBtn", "notificationsBtn", "refresh-live",
          "floorPlanViewBtn", "listViewBtn", "resetFiltersBtn"].includes(control.id)
      );
      if (!knownButton && !tableNode) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!state.authorized) {
        notify("Checking administrator access…", true);
        return;
      }
      if (action) {
        if (action.dataset.action === "edit") openModal("edit", action.dataset.id);
        if (action.dataset.action === "cancel") void cancelBooking(action.dataset.id);
      } else if (open || control?.id === "addBookingBtn") {
        openModal();
      } else if (close) {
        document.querySelector("#bookingModal").classList.add("hidden");
      } else if (tableNode) {
        const tableId = Number(tableNode.dataset.tableId || tableNode.dataset.selectTable || tableNode.id.replace("table-node-", ""));
        if (state.tables.some((table) => table.id === tableId)) {
          state.selectedTableId = tableId;
          renderSelectedTable();
        }
      } else if (control?.id === "editSelectedReservationBtn") {
        const booking = state.bookings.find((item) => Number(item.table_id) === state.selectedTableId && item.status !== "Cancelled");
        if (booking) openModal("edit", booking.id);
      } else if (control?.id === "cancelSelectedReservationBtn") {
        const booking = state.bookings.find((item) => Number(item.table_id) === state.selectedTableId && item.status !== "Cancelled");
        if (booking) void cancelBooking(booking.id);
      } else if (control?.id === "blockTableBtn") {
        void toggleTableBlock();
      } else if (control?.id === "viewCalendarBtn") {
        location.hash = "calendarSection";
      } else if (control?.id === "exportReportBtn") {
        void window.SEATSYNC_API.exportAdminBookings().then(downloadCsv).catch((error) => notify(error.message, true));
      } else if (control?.id === "notificationsBtn") {
        const active = state.bookings.filter((booking) => booking.status !== "Cancelled").length;
        notify(`${active} active booking(s).`);
      } else if (control?.id === "resetFiltersBtn" || control?.id === "viewAllBookingsBtn") {
        document.querySelector("#searchInput").value = "";
        document.querySelector("#adminStatusFilter").value = "all";
        document.querySelector("#adminDateFilter").value = "";
        void refreshBookings().catch((error) => notify(error.message, true));
      } else if (control?.id === "floorPlanViewBtn") {
        document.querySelector("#floorMapCanvas")?.classList.remove("hidden");
        document.querySelector("#tableListView")?.classList.add("hidden");
      } else if (control?.id === "listViewBtn") {
        document.querySelector("#floorMapCanvas")?.classList.add("hidden");
        document.querySelector("#tableListView")?.classList.remove("hidden");
      } else if (control?.id === "refresh-live") {
        void refreshAll();
      }
    }, true);

    document.addEventListener("submit", (event) => {
      if (event.target?.id !== "addBookingForm") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.authorized) void saveBooking(event);
    }, true);
  }

  async function initialize() {
    if (shell) shell.style.display = "none";
    showAccessMessage("Checking your administrator account…");
    interceptEvents();
    try {
      state.user = await window.SEATSYNC_API.me();
      if (state.user.role !== "admin") {
        showAccessMessage("Administrator access is required to view this dashboard.", true);
        return;
      }
      state.authorized = true;
      if (shell) shell.style.display = "";
      document.querySelector("#admin-access-message")?.remove();
      document.querySelectorAll(".admin-nav-button").forEach((link) => {
        link.addEventListener("click", () => {
          document.querySelectorAll(".admin-nav-button").forEach((item) => item.classList.remove("is-active"));
          link.classList.add("is-active");
        });
      });
      const tableSelect = document.querySelector("#custVenue");
      tableSelect?.addEventListener("change", () => populateModalTables());
      document.querySelector("#addBookingForm")?.addEventListener("submit", saveBooking);
      await refreshAll();
    } catch (error) {
      window.SEATSYNC_API.logout();
      showAccessMessage(error.message || "Sign in with an administrator account to continue.", true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
