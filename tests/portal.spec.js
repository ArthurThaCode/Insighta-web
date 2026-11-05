// Runs the real portal page in Chromium against a simulated backend.
const fs = require("node:fs");
const { test, expect } = require("@playwright/test");

const API = "https://api.example";
const XSS_NAME = `<img src=x onerror="window.__xss=1">`;
const CSRF_TOKEN = "csrf-token-from-session";

const profile = (overrides = {}) => ({
  id: "profile-1", name: "Ada", gender: "female", age: 31, age_group: "adult", country_id: "NG", created_at: "2026-01-01T00:00:00.000Z", ...overrides,
});

async function mockBackend(page, { user = { username: "admin", login: "admin", role: "admin", github_id: "1" }, rows = [profile()] } = {}) {
  const calls = [];
  const backend = { signedIn: true, exportStatus: 200, calls };
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { "Access-Control-Allow-Origin": new URL(page.url() === "about:blank" ? "http://localhost:5180" : page.url()).origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type,x-api-version,x-csrf-token,accept", "Access-Control-Allow-Methods": "GET,POST,DELETE" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ method: request.method(), path: url.pathname, headers: request.headers() });
    const json = (status, data) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(data) });

    if (url.pathname === "/auth/logout") {
      backend.signedIn = false;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/auth/refresh") return backend.refreshToken ? json(200, { csrf_token: backend.refreshToken }) : json(401, { message: "Invalid" });
    if (!backend.signedIn) return json(401, { message: "Authentication required" });
    if (backend.expireOnce && request.method() === "POST") {
      backend.expireOnce = false;
      return json(401, { message: "Invalid or expired access token" });
    }
    if (url.pathname === "/api/v1/session/me") return json(200, { data: { user, csrf_token: CSRF_TOKEN } });
    if (url.pathname === "/api/v1/profiles/export") {
      if (backend.exportStatus !== 200) return json(backend.exportStatus, { status: "error", message: "Internal server error" });
      return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/csv" }, body: "id,name\nprofile-1,Ada\n" });
    }
    if (url.pathname === "/api/v1/profiles/search" || (url.pathname === "/api/v1/profiles" && request.method() === "GET")) {
      return json(200, { status: "success", page: 1, limit: 10, total: rows.length, total_pages: 1, data: rows });
    }
    if (request.method() === "POST") return json(201, { status: "success", data: profile() });
    if (request.method() === "DELETE") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.startsWith("/api/v1/profiles/")) return json(200, { status: "success", data: rows[0] });
    return json(404, { message: "Route not found" });
  });
  return backend;
}

const openPortal = async (page) => {
  await page.goto(`/?api=${encodeURIComponent(API)}`);
  await expect(page.locator("#session")).not.toHaveText("Checking session...");
};

test.describe("XSS", () => {
  const malicious = profile({ name: XSS_NAME, gender: XSS_NAME, age_group: XSS_NAME, country_id: XSS_NAME });

  test("does not execute HTML from profile data in the list", async ({ page }) => {
    await mockBackend(page, { rows: [malicious] });
    await openPortal(page);
    await page.click('button[data-view="profiles"]');
    await expect(page.locator("#rows button").first()).toHaveText(XSS_NAME);
    await expect(page.locator("#rows img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("does not execute HTML from profile data in search results", async ({ page }) => {
    await mockBackend(page, { rows: [malicious] });
    await openPortal(page);
    await page.click('button[data-view="search"]');
    await page.fill("#q", "males");
    await page.click("#searchBtn");
    await expect(page.locator("#searchRows button").first()).toHaveText(XSS_NAME);
    await expect(page.locator("#searchRows img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("does not execute HTML from the user account", async ({ page }) => {
    await mockBackend(page, { user: { username: XSS_NAME, login: "x", role: "analyst", github_id: "1" } });
    await openPortal(page);
    await page.click('button[data-view="account"]');
    await expect(page.locator("#accountDetails")).toContainText(XSS_NAME);
    await expect(page.locator("#accountDetails img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

test.describe("CSRF", () => {
  test("sends the token from session/me on writes and logout", async ({ page }) => {
    const backend = await mockBackend(page);
    await openPortal(page);
    await page.click('button[data-view="profiles"]');

    await page.fill("#newName", "Grace");
    await page.click("#create");
    await expect.poll(() => backend.calls.find((call) => call.method === "POST")?.headers["x-csrf-token"]).toBe(CSRF_TOKEN);

    await page.click('button[data-delete="profile-1"]');
    await expect.poll(() => backend.calls.find((call) => call.method === "DELETE")?.headers["x-csrf-token"]).toBe(CSRF_TOKEN);

    await page.click("#logout");
    await expect.poll(() => backend.calls.find((call) => call.path === "/auth/logout")?.headers["x-csrf-token"]).toBe(CSRF_TOKEN);
    await expect(page.locator("#session")).toHaveText("Not signed in");
  });

  test("uses the new token after a refresh", async ({ page }) => {
    const backend = await mockBackend(page);
    await openPortal(page);
    await page.click('button[data-view="profiles"]');
    backend.expireOnce = true;
    backend.refreshToken = "csrf-token-after-refresh";

    await page.fill("#newName", "Grace");
    await page.click("#create");
    await expect.poll(() => backend.calls.filter((call) => call.method === "POST" && call.path === "/api/v1/profiles").at(-1)?.headers["x-csrf-token"]).toBe("csrf-token-after-refresh");
  });
});

test.describe("session loading", () => {
  test("does not call the legacy profiles route", async ({ page }) => {
    const backend = await mockBackend(page);
    await openPortal(page);
    await expect(page.locator("#session")).toHaveText("admin (admin)");
    expect(backend.calls.some((call) => call.path === "/api/profiles")).toBe(false);
  });
});

test.describe("CSV export", () => {
  test("downloads the file when the request succeeds", async ({ page }) => {
    await mockBackend(page);
    await openPortal(page);
    await page.click('button[data-view="profiles"]');
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export")]);
    expect(fs.readFileSync(await download.path(), "utf8")).toContain("profile-1,Ada");
  });

  test("shows the error instead of saving it as a file", async ({ page }) => {
    const backend = await mockBackend(page);
    await openPortal(page);
    await page.click('button[data-view="profiles"]');
    backend.exportStatus = 500;
    let downloaded = false;
    page.on("download", () => { downloaded = true; });
    await page.click("#export");
    await expect(page.locator("#meta")).toHaveText("Export failed: Internal server error");
    expect(downloaded).toBe(false);
  });
});

test.describe("api parameter", () => {
  test("accepts https and shows the backend in use", async ({ page }) => {
    await mockBackend(page);
    await openPortal(page);
    await expect(page.locator("#apiBase")).toHaveText(`Backend: ${API}`);
    expect(await page.evaluate(() => localStorage.getItem("INSIGHTA_API_URL"))).toBe(API);
  });

  test("accepts http://localhost for development", async ({ page }) => {
    await page.goto(`/?api=${encodeURIComponent("http://localhost:3000")}`);
    await expect(page.locator("#apiBase")).toHaveText("Backend: http://localhost:3000");
  });

  for (const value of ["http://evil.example", "javascript:alert(1)", "http://127.0.0.1:3000"]) {
    test(`ignores ${value}`, async ({ page }) => {
      await page.goto(`/?api=${encodeURIComponent(value)}`);
      await expect(page.locator("#apiBase")).toContainText("ignored");
      expect(await page.evaluate(() => localStorage.getItem("INSIGHTA_API_URL"))).toBeNull();
    });
  }
});
