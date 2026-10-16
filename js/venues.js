"use strict";
window.SEATSYNC_API_BASE = "http://127.0.0.1:8001/api";
window.SEATSYNC_API = {
  async request(path, options = {}) {
    const token = localStorage.getItem("seatsync.token");
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${window.SEATSYNC_API_BASE}${path}`, {
      ...options,
      headers,
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const payloadText = typeof data === "string"
        ? data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        : "";
      const errorDetail = data?.detail;
      const detail = Array.isArray(errorDetail)
        ? errorDetail.map((item) => item.msg || "Invalid request").join(" ")
        : errorDetail || payloadText || "Request failed.";
      const readable = detail.includes("Unsupported method") || detail.includes("Error response")
        ? "The SeatSync API is not accepting this request. Check that the backend is running on http://127.0.0.1:8001 and that the endpoint and method are correct."
        : detail;
      throw new Error(readable);
    }
    return data;
  },
  async login(payload) {
    const result = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (result?.token) {
      localStorage.setItem("seatsync.token", result.token);
    }
    return result;
  },
  async register(payload) {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async me() {
    return this.request("/auth/me");
  },
  async updateMe(payload) {
    return this.request("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  logout() {
    localStorage.removeItem("seatsync.token");
    localStorage.removeItem("seatsync.profile");
    localStorage.removeItem("seatsync.demo.profile.v1");
  },
  async getVenues() {
    return this.request("/venues");
  },
  async getVenue(venueId) {
    return this.request(`/venues/${encodeURIComponent(venueId)}`);
  },
  async getVenueTables(venueId) {
    return this.request(`/venues/${encodeURIComponent(venueId)}/tables`);
  },
  async getAvailability(venueId, filters) {
    const url = new URL(`${window.SEATSYNC_API_BASE}/venues/${encodeURIComponent(venueId)}/availability`);
    for (const [key, value] of Object.entries(filters || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return this.request(`${url.pathname.replace("/api", "")}${url.search}`);
  },
  async createBooking(payload) {
    return this.request("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async myBookings() {
    return this.request("/bookings/my");
  },
  async getBooking(bookingId) {
    return this.request(`/bookings/${encodeURIComponent(bookingId)}`);
  },
  async updateBooking(bookingId, payload) {
    return this.request(`/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async cancelBooking(bookingId) {
    return this.request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: "POST",
    });
  },
  async createAdminBooking(payload) {
    return this.request("/admin/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async updateAdminBooking(bookingId, payload) {
    return this.request(`/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async cancelAdminBooking(bookingId) {
    return this.request(`/admin/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: "POST",
    });
  },
  async adminTables() {
    return this.request("/admin/tables");
  },
  async updateAdminTable(tableId, payload) {
    return this.request(`/admin/tables/${encodeURIComponent(tableId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async adminBookings(params = {}) {
    const url = new URL(`${window.SEATSYNC_API_BASE}/admin/bookings`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return this.request(`${url.pathname.replace("/api", "")}${url.search}`);
  },
  async adminStats() {
    return this.request("/admin/stats");
  },
  async exportAdminBookings() {
    return this.request("/admin/bookings/export");
  },
};
// Sample venues share an illustrative floor plan in this frontend demo.
window.SEATSYNC_VENUES = Object.freeze({
  cafe: { name: "SeatSync Café", type: "Café" },
  restaurant: { name: "The Violet Room", type: "Restaurant" },
  bistro: { name: "Garden Bistro", type: "Bistro" },
});
