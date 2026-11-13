"use strict";

(() => {
  const params = new URLSearchParams(location.search);
  const bookingId = params.get("booking_id") || "";
  const keyName = `seatsync.demo-payment.idempotency.${bookingId}`;
  const message = document.querySelector("#payment-message");
  const actions = document.querySelector("#payment-actions");
  const retryButton = document.querySelector("#retry-payment");
  const newBooking = document.querySelector("#new-booking");
  const countdown = document.querySelector("#countdown");
  const buttons = [...document.querySelectorAll("[data-scenario]")];
  let payment = null;
  let expiryTime = 0;
  let busy = false;
  let expirySubmitted = false;

  function showMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    for (const button of [...buttons, retryButton]) button.disabled = value;
  }

  function errorText(error) {
    if (error?.status === 404) return "Demo payments are currently unavailable. Please try again later.";
    if (error?.status === 401) return "Your sign-in has expired. Please sign in again to continue.";
    if (error?.status === 409) return error.message || "This booking can no longer be paid. Please start a new booking.";
    return error?.message || "The demo payment could not be completed. Please try again.";
  }

  function getOrCreateKey() {
    let key = localStorage.getItem(keyName);
    if (!key) {
      key = makeKey();
      localStorage.setItem(keyName, key);
    }
    return key;
  }

  function makeKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function updateCountdown() {
    const remaining = Math.max(0, expiryTime - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    countdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (!seconds && !expirySubmitted && payment?.status === "pending") {
      expirySubmitted = true;
      void simulate("expiry", true);
    }
    if (!seconds && payment?.status === "pending") {
      for (const button of buttons) button.disabled = true;
    }
    if (!seconds && payment?.status === "failed") {
      retryButton.hidden = true;
      newBooking.hidden = false;
      showMessage("The original booking hold has expired. The booking was not confirmed.", "warning");
    }
  }

  function renderBooking(booking, tables) {
    const venue = window.SEATSYNC_VENUES[booking.venue_id];
    const table = tables.find((item) => item.id === booking.table_id);
    document.querySelector("#venue-name").textContent = venue?.name || booking.venue_id;
    const date = new Date(`${booking.reservation_date}T12:00:00`);
    document.querySelector("#booking-date").textContent = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    document.querySelector("#booking-time").textContent = booking.start_time.slice(0, 5);
    document.querySelector("#booking-guests").textContent = `${booking.guest_count} ${booking.guest_count === 1 ? "guest" : "guests"}`;
    document.querySelector("#booking-table").textContent = table ? `${table.display_name} · Table ${table.table_number}` : `Table ${booking.table_id}`;
  }

  function showTerminalState(result) {
    payment = result;
    actions.hidden = true;
    if (result.status === "paid" && result.booking_status === "confirmed") {
      showMessage("Demo payment verified and booking confirmed. No real money was charged.", "success");
      location.href = `confirmation.html?id=${encodeURIComponent(bookingId)}`;
      return;
    }
    if (result.status === "failed") {
      // The backend consumes an idempotency key per attempt. Rotate only after
      // a failed result is known; an uncertain request keeps the original key.
      localStorage.setItem(keyName, makeKey());
      showMessage("The demo payment failed. Your booking is not confirmed.", "error");
      retryButton.hidden = Date.now() >= expiryTime;
      newBooking.hidden = Date.now() < expiryTime;
      return;
    }
    if (result.status === "expired" || result.booking_status === "expired") {
      showMessage("This booking hold has expired. It was not confirmed.", "warning");
      newBooking.hidden = false;
      return;
    }
    if (result.status === "paid" || result.booking_status === "confirmed") {
      showMessage("We could not verify both payment and booking status. Please check My bookings before trying again.", "error");
      return;
    }
    if (result.status !== "pending" || !["pending", "pending_payment"].includes(result.booking_status)) {
      showMessage("This booking is no longer eligible for payment. Please start a new booking.", "warning");
      newBooking.hidden = false;
      return;
    }
    actions.hidden = false;
    showMessage("Choose a test scenario below. This simulation never charges real money.");
  }

  async function simulate(scenario, automatic = false) {
    if (busy || !payment?.id) return;
    if (scenario === "success" && Date.now() >= expiryTime) {
      showMessage("The booking hold has expired. Payment cannot succeed now.", "warning");
      if (!expirySubmitted) {
        expirySubmitted = true;
        return simulate("expiry", true);
      }
      return;
    }
    setBusy(true);
    showMessage(automatic ? "Updating the expired booking hold…" : "Processing the selected demo outcome…");
    try {
      const result = await window.SEATSYNC_API.simulateDemoPayment(payment.id, scenario);
      showTerminalState(result);
    } catch (error) {
      showMessage(errorText(error), "error");
      if (error?.status === 409) {
        actions.hidden = true;
        newBooking.hidden = false;
      }
    } finally {
      setBusy(false);
    }
  }

  async function initiate() {
    if (!bookingId) throw new Error("The booking ID is missing. Please start a new booking.");
    if (!localStorage.getItem("seatsync.token")) {
      const next = `demo-payment.html?booking_id=${encodeURIComponent(bookingId)}`;
      location.href = `account.html?${new URLSearchParams({ next })}`;
      return null;
    }
    const booking = await window.SEATSYNC_API.getBooking(bookingId);
    const tables = await window.SEATSYNC_API.getVenueTables(booking.venue_id);
    renderBooking(booking, tables);
    if (!["pending", "pending_payment"].includes(booking.status)) {
      throw new Error("This booking is no longer eligible for payment. Please start a new booking.");
    }
    const result = await window.SEATSYNC_API.initiateDemoPayment(bookingId, getOrCreateKey());
    if (!result?.expires_at) throw new Error("The payment service did not return an expiry time.");
    if (Number(result.amount) !== 100 || result.currency !== "KZT") {
      throw new Error("The payment service returned an unexpected booking fee. Please contact SeatSync support.");
    }
    payment = result;
    expiryTime = new Date(result.expires_at).getTime();
    if (!Number.isFinite(expiryTime)) throw new Error("The payment service returned an invalid expiry time.");
    document.querySelector("#payment-amount").textContent = `${Number(result.amount).toFixed(2)} ${result.currency}`;
    if (result.status === "failed") {
      // Recover a prior failed attempt after a reload by rotating the attempt key.
      localStorage.setItem(keyName, makeKey());
      showTerminalState({ ...result, status: "failed" });
      return result;
    }
    if (result.status === "expired") {
      showTerminalState(result);
      updateCountdown();
      return result;
    }
    showTerminalState(result);
    updateCountdown();
    setInterval(updateCountdown, 1000);
    return result;
  }

  retryButton.addEventListener("click", async () => {
    if (busy || Date.now() >= expiryTime) {
      showMessage("The booking hold has expired. Please start a new booking.", "warning");
      newBooking.hidden = false;
      retryButton.hidden = true;
      return;
    }
    setBusy(true);
    showMessage("Starting a new attempt within the original booking hold…");
    try {
      const result = await window.SEATSYNC_API.initiateDemoPayment(bookingId, getOrCreateKey());
      if (result.status !== "pending") {
        showTerminalState(result);
      } else {
        payment = result;
        expiryTime = new Date(result.expires_at).getTime();
        actions.hidden = false;
        retryButton.hidden = true;
        showMessage("Choose a test scenario below. The original booking expiry has not been extended.");
      }
    } catch (error) {
      showMessage(errorText(error), "error");
      if (error?.status === 409) {
        retryButton.hidden = true;
        newBooking.hidden = false;
      }
    } finally {
      setBusy(false);
    }
  });

  for (const button of buttons) button.addEventListener("click", () => void simulate(button.dataset.scenario));
  initiate().catch((error) => {
    showMessage(errorText(error), "error");
    countdown.textContent = "—";
    if (error?.status === 409 || /expired|eligible/i.test(error.message || "")) newBooking.hidden = false;
  });
})();
