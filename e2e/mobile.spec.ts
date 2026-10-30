import { devices, expect, test } from "@playwright/test";
import { expectToast, login } from "./helpers";

/**
 * Phone layout (iPhone 13 viewport, touch, Chromium): the bottom bar and its
 * menu sheet, dialogs as bottom sheets, the validation queue and the library's
 * badge edit mode.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];
test.use(iPhone);

test.beforeEach(async ({ page }) => {
  // The install prompt has its own checks; keep it out of these journeys.
  await page.addInitScript(() => localStorage.setItem("creative-hub:install", JSON.stringify({ never: true })));
});

test.describe("phone layout", () => {
  test("the menu opens as a sheet from the bottom bar, navigates and closes", async ({ page }) => {
    await login(page, "admin", "/library");
    await expect(page.getByTestId("mobile-nav")).toBeVisible();
    await page.getByTestId("mobile-menu-button").click();
    const menu = page.getByTestId("mobile-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Campaigns" }).click();
    await expect(page).toHaveURL(/\/campaigns/);
    await expect(menu).toBeHidden();

    await page.getByTestId("mobile-menu-button").click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("the validation queue uses the library cards with tabs for pending, in review and drafts", async ({ page }) => {
    await login(page, "manager", "/validation?tab=DRAFT");
    await expect(page.getByTestId("queue-tab-DRAFT")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("queue-tab-PENDING")).toBeVisible();
    await expect(page.getByTestId("queue-tab-IN_REVIEW")).toBeVisible();
  });

  test("dialogs are bottom sheets whose buttons stay reachable and that close", async ({ page }) => {
    await login(page, "manager", "/campaigns");
    await page.getByRole("button", { name: "New campaign" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const viewport = page.viewportSize()!;
    // Once the slide-in animation is over, the sheet ends at the bottom of the screen.
    await expect(async () => {
      const box = (await dialog.boundingBox())!;
      expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height);
    }).toPass();
    await expect(dialog.getByRole("button", { name: "Create campaign" })).toBeInViewport();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("admins add and remove a badge on several creatives at once from the library", async ({ page }) => {
    await login(page, "admin", "/library?kind=all");
    await page.getByTestId("edit-mode").click();
    const bar = page.getByTestId("selection-bar");
    await expect(bar).toContainText("Tap cards to select");
    await page.getByTestId("reel-card").first().click();
    await expect(bar).toContainText("1 selected");

    await bar.getByTestId("badge-select").click();
    const option = page.getByRole("option").first();
    const name = (await option.innerText()).trim();
    await option.click();
    await expectToast(page, `“${name}” added to 1 creative.`);

    await bar.getByRole("button", { name: "Remove badge" }).click();
    // Scope to the remove list: the add list may still be fading out.
    const removeList = page.locator("[cmdk-root]").filter({ has: page.getByPlaceholder("Badge to remove…") });
    await removeList.getByRole("option", { name }).click();
    await expectToast(page, `“${name}” removed from 1 creative.`);

    await bar.getByRole("button", { name: "Exit edit mode" }).click();
    await expect(bar).toBeHidden();
  });
});
