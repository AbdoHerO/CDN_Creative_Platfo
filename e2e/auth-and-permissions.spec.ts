import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("authentication", () => {
  test("redirects anonymous users to the login page and back after signing in", async ({ page }) => {
    await page.goto("/library?q=summer");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary%3Fq%3Dsummer/);
    await page.fill("#email", USERS.admin.email);
    await page.fill("#password", USERS.admin.password);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/library\?q=summer/);
    await expect(page.getByRole("heading", { name: "Creative Library" })).toBeVisible();
  });

  test("rejects wrong credentials with a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", USERS.admin.email);
    await page.fill("#password", "definitely-wrong-password");
    await page.click("button[type=submit]");
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs out and invalidates the session", async ({ page }) => {
    await login(page, "admin");
    const cookie = (await page.context().cookies()).find((c) => c.name === "cmp_session");
    expect(cookie?.httpOnly).toBe(true);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    // Re-using the old cookie no longer works: the session was deleted server-side.
    await page.context().addCookies([{ ...cookie!, expires: -1 }]);
    const res = await page.request.get("/api/notifications");
    expect(res.status()).toBe(401);
  });

  test("protects APIs without a session", async ({ request }) => {
    expect((await request.get("/api/search?q=test")).status()).toBe(401);
    expect((await request.post("/api/uploads/plan", { data: {} })).status()).toBe(401);
    expect((await request.get("/api/health")).status()).toBe(200);
  });
});

test.describe("role-based access", () => {
  test("viewers cannot upload, validate or administer — in the UI and on the server", async ({ page }) => {
    await login(page, "viewer");
    const nav = page.getByRole("navigation").or(page.locator("[data-sidebar=content]"));
    await expect(page.getByRole("link", { name: "Creative Library" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Upload", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Team & Users" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pending Validation" })).toHaveCount(0);

    await page.goto("/upload");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    await expect(page.getByText("You do not have permission to open that page.")).toBeVisible();
    await page.goto("/team");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);

    const res = await page.request.post("/api/uploads/plan", {
      headers: { Origin: new URL(page.url()).origin },
      data: { applicationId: "x", files: [{ clientId: "a", name: "a.png", size: 10 }] },
    });
    expect(res.status()).toBe(403);
  });

  test("viewers only ever see approved creatives", async ({ page }) => {
    await login(page, "viewer", "/library");
    const badges = page.locator("main li").locator("text=/^(Draft|Pending|In review|Declined|Archived)$/");
    await expect(badges).toHaveCount(0);
  });

  test("creators cannot open administration pages", async ({ page }) => {
    await login(page, "creator");
    await expect(page.getByRole("link", { name: "Team & Users" })).toHaveCount(0);
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    await page.goto("/storage");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  });

  test("blocks cross-site requests to mutating APIs", async ({ page }) => {
    await login(page, "creator");
    const res = await page.request.post("/api/uploads/plan", {
      headers: { Origin: "https://evil.example.com" },
      data: { applicationId: "x", files: [{ clientId: "a", name: "a.png", size: 10 }] },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/cross-origin/i);
  });
});
