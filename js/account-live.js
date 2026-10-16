"use strict";

(() => {
  const profileKey = "seatsync.profile";
  const pagePrefix = location.pathname.includes("/pages/") ? "" : "pages/";
  const loginForm = document.querySelector("#demo-signin");
  const message = (element, text, visible = true) => {
    if (!element) return;
    element.textContent = text;
    element.hidden = !visible;
  };
  const readProfile = () => {
    try {
      const profile = JSON.parse(localStorage.getItem(profileKey) || "null");
      return profile && typeof profile.id === "string" ? profile : null;
    } catch {
      return null;
    }
  };
  let currentUser = readProfile();
  let registering = false;

  function nextPage() {
    const next = new URLSearchParams(location.search).get("next");
    if (!next) return null;
    try {
      const target = new URL(next, location.href);
      const allowedPaths = [
        new URL("booking.html", location.href).pathname,
        new URL("confirmation.html", location.href).pathname,
      ];
      return target.origin === location.origin && allowedPaths.includes(target.pathname)
        ? target.href
        : null;
    } catch {
      return null;
    }
  }

  function renderHeader() {
    const user = currentUser;
    document.querySelectorAll("[data-account-link]").forEach((link) => {
      link.textContent = user ? `◉ ${user.name.split(/\s+/)[0]}` : "Sign in";
      link.href = `${pagePrefix}account.html`;
      link.setAttribute("aria-label", user ? "Open your profile" : "Sign in");
    });
  }

  function renderProfile() {
    const signinSection = document.querySelector("#signin-section");
    const profileSection = document.querySelector("#profile-section");
    if (!signinSection || !profileSection) return;
    signinSection.hidden = Boolean(currentUser);
    profileSection.hidden = !currentUser;
    if (!currentUser) return;

    document.querySelector("#welcome-name").textContent = currentUser.name;
    document.querySelector("#profile-name").value = currentUser.name;
    document.querySelector("#profile-email").value = currentUser.email;
    document.querySelector("#current-role").textContent =
      currentUser.role === "admin" ? "Administrator" : "Guest";
    document.querySelectorAll("[data-admin-only]").forEach((element) => {
      element.hidden = currentUser.role !== "admin";
    });
  }

  function setAuthMode(register) {
    registering = register;
    const nameInput = loginForm?.elements.name;
    if (nameInput) {
      nameInput.required = register;
      nameInput.hidden = !register;
      const label = document.querySelector('label[for="signin-name"]');
      if (label) label.hidden = !register;
    }
    const submit = loginForm?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = register ? "Create account" : "Sign in";
    const toggle = document.querySelector("#toggle-auth-mode");
    if (toggle) toggle.textContent = register ? "I already have an account" : "Create an account";
    message(document.querySelector("#signin-message"), "", false);
  }

  async function renderBookings() {
    const bookingList = document.querySelector("#booking-list");
    if (!bookingList) return;
    const signedOut = document.querySelector("#bookings-signed-out");
    const signedIn = document.querySelector("#bookings-signed-in");
    signedOut.hidden = Boolean(currentUser);
    signedIn.hidden = !currentUser;
    if (!currentUser) return;

    const status = document.querySelector("#bookings-message");
    bookingList.replaceChildren();
    message(status, "Loading your bookings…");
    try {
      const bookings = await window.SEATSYNC_API.myBookings();
      const tablesByVenue = new Map();
      await Promise.all([...new Set(bookings.map((booking) => booking.venue_id))].map(async (venueId) => {
        const tables = await window.SEATSYNC_API.getVenueTables(venueId);
        tablesByVenue.set(venueId, new Map(tables.map((table) => [table.id, table])));
      }));
      const sorted = [...bookings].sort((a, b) =>
        `${a.reservation_date}T${a.start_time}`.localeCompare(`${b.reservation_date}T${b.start_time}`),
      );
      bookingList.replaceChildren();
      document.querySelector("#bookings-empty").hidden = sorted.length > 0;
      document.querySelector("#bookings-count").textContent =
        `${sorted.length} ${sorted.length === 1 ? "booking" : "bookings"}`;
      for (const booking of sorted) {
        const card = document.querySelector("#booking-template").content.cloneNode(true);
        const venue = window.SEATSYNC_VENUES[booking.venue_id];
        const table = tablesByVenue.get(booking.venue_id)?.get(booking.table_id);
        const startsAt = new Date(`${booking.reservation_date}T${booking.start_time}`);
        card.querySelector("[data-venue]").textContent = venue?.name || booking.venue_id;
        card.querySelector("[data-date]").textContent = startsAt.toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric",
        });
        card.querySelector("[data-time]").textContent = booking.start_time.slice(0, 5);
        card.querySelector("[data-guests]").textContent =
          `${booking.guest_count} ${booking.guest_count === 1 ? "guest" : "guests"}`;
        card.querySelector("[data-table]").textContent =
          table ? `${table.display_name} · Table ${table.table_number}` : `Table ${booking.table_id}`;
        card.querySelector("[data-status]").textContent = booking.status;
        const edit = card.querySelector("[data-edit]");
        const canEdit = booking.status !== "cancelled" && startsAt > new Date();
        edit.hidden = !canEdit;
        edit.href = `booking.html?${new URLSearchParams({
          venue: booking.venue_id,
          date: booking.reservation_date,
          time: booking.start_time.slice(0, 5),
          guests: String(booking.guest_count),
          table: String(booking.table_id),
          id: booking.id,
        })}`;
        const cancel = card.querySelector("[data-cancel]");
        cancel.hidden = !canEdit;
        cancel.addEventListener("click", async () => {
          if (!window.confirm("Cancel this booking?")) return;
          cancel.disabled = true;
          try {
            await window.SEATSYNC_API.cancelBooking(booking.id);
            await renderBookings();
          } catch (error) {
            cancel.disabled = false;
            message(status, error.message || "The booking could not be cancelled.");
          }
        });
        bookingList.append(card);
      }
      message(status, "");
    } catch (error) {
      document.querySelector("#bookings-empty").hidden = true;
      message(status, error.message || "Your bookings could not be loaded.");
    }
  }

  async function verifySession() {
    if (!localStorage.getItem("seatsync.token")) {
      currentUser = null;
      renderHeader();
      renderProfile();
      await renderBookings();
      return;
    }
    try {
      currentUser = await window.SEATSYNC_API.me();
      localStorage.setItem(profileKey, JSON.stringify(currentUser));
    } catch {
      window.SEATSYNC_API.logout();
      currentUser = null;
    }
    renderHeader();
    renderProfile();
    await renderBookings();
  }

  if (loginForm) {
    setAuthMode(false);
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!loginForm.reportValidity()) return;
      const name = loginForm.elements.name.value.trim();
      const email = loginForm.elements.email.value.trim().toLowerCase();
      const password = loginForm.elements.password.value;
      const status = document.querySelector("#signin-message");
      const submit = loginForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      message(status, registering ? "Creating your account…" : "Signing in…");
      try {
        if (registering) {
          await window.SEATSYNC_API.register({ name, email, password });
        }
        const result = await window.SEATSYNC_API.login({ email, password });
        currentUser = result.user;
        localStorage.setItem(profileKey, JSON.stringify(currentUser));
        renderHeader();
        const destination = nextPage();
        if (destination) {
          location.href = currentUser.role === "admin" ? "admin.html" : destination;
          return;
        }
        renderProfile();
        await renderBookings();
      } catch (error) {
        message(status, error.message || "Authentication failed. Please try again.");
      } finally {
        submit.disabled = false;
      }
    });
    document.querySelector("#toggle-auth-mode")?.addEventListener("click", () => {
      setAuthMode(!registering);
    });
  }

  document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.querySelector("#profile-name").value.trim();
    const status = document.querySelector("#profile-message");
    if (!name) {
      message(status, "Please enter your name.");
      return;
    }
    const saveButton = event.currentTarget.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      currentUser = await window.SEATSYNC_API.updateMe({ name });
      localStorage.setItem(profileKey, JSON.stringify(currentUser));
      renderHeader();
      renderProfile();
      message(status, "Profile updated.");
    } catch (error) {
      message(status, error.message || "Your profile could not be updated.");
    } finally {
      saveButton.disabled = false;
    }
  });

  document.querySelector("#signout")?.addEventListener("click", async () => {
    window.SEATSYNC_API.logout();
    currentUser = null;
    renderHeader();
    renderProfile();
    await renderBookings();
  });

  verifySession();
})();
