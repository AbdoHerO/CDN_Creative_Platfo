import { expect, test } from "@playwright/test";
import { expectToast, login } from "./helpers";

test.describe("administration", () => {
  const stamp = Date.now().toString(36);

  test("manager creates a campaign and sees it in the campaign list", async ({ page }) => {
    await login(page, "manager", "/campaigns");
    await page.getByRole("button", { name: "New campaign" }).click();
    await page.getByLabel("Name").fill(`Autumn launch ${stamp}`);
    await page.getByLabel("Start date").fill("2026-11-01");
    await page.getByLabel("End date").fill("2026-12-15");
    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Autumn launch ${stamp}`) })).toBeVisible();
    await page.goto(`/campaigns?q=${stamp}`);
    await expect(page.getByRole("link", { name: `Autumn launch ${stamp}` })).toBeVisible();
  });

  test("campaign dates are validated", async ({ page }) => {
    await login(page, "manager", "/campaigns");
    await page.getByRole("button", { name: "New campaign" }).click();
    await page.getByLabel("Name").fill(`Broken ${stamp}`);
    await page.getByLabel("Start date").fill("2026-12-15");
    await page.getByLabel("End date").fill("2026-11-01");
    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect(page.getByText("End date must be after the start date.")).toBeVisible();
  });

  test("admin creates a user with a one-time temporary password", async ({ page }) => {
    await login(page, "admin", "/team");
    await page.getByRole("button", { name: "Add user" }).click();
    await page.getByLabel("Full name").fill(`Test Creator ${stamp}`);
    await page.getByLabel("Email").fill(`creator.${stamp}@cmp.local`);
    await page.getByRole("button", { name: "Create user" }).click();
    const password = await page.getByTestId("temporary-password").textContent();
    expect(password?.length).toBeGreaterThanOrEqual(10);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(`creator.${stamp}@cmp.local`)).toBeVisible();

    // The new user must set a personal password at first sign-in.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill("#email", `creator.${stamp}@cmp.local`);
    await page.fill("#password", password!.trim());
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/change-password/);
    await page.getByLabel("Current password").fill(password!.trim());
    await page.getByLabel("New password", { exact: true }).fill("Brand-New-Pass-2026");
    await page.getByLabel("Confirm new password").fill("Brand-New-Pass-2026");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("admin creates an application without any code change", async ({ page }) => {
    await login(page, "admin", "/applications");
    await page.getByRole("button", { name: "New application" }).click();
    await page.getByLabel("Name").fill(`NewApp ${stamp}`);
    await page.getByRole("button", { name: "Create application" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`NewApp ${stamp}`) })).toBeVisible();
    await expectToast(page, "Application created.");
  });

  test("global search finds creatives and campaigns", async ({ page }) => {
    await login(page, "admin");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Search by name, filename, tag, campaign…").fill("Summer");
    await expect(page.getByRole("dialog").getByText(/Summer/).first()).toBeVisible();
  });

  test("storage page shows database-backed usage", async ({ page }) => {
    await login(page, "admin", "/storage");
    await expect(page.getByText("Total stored", { exact: true })).toBeVisible();
    await expect(page.getByText("Storage by application", { exact: true })).toBeVisible();
    // The accessible chart caption names applications, never internal ids.
    await expect(page.locator("figcaption").first()).toContainText(/Win\+Pharma|iCoral|Pharmalien|WinMed/);
  });
});
