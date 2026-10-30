import { expect, test } from "@playwright/test";
import { expectToast, login, uniqueFixture } from "./helpers";

/**
 * Bulk validation from the Pending Validation page: a creator submits every
 * draft at once, a manager approves one selected creative, then the rest with
 * "Approve all", and viewers find them all among approved creatives.
 */
test.describe.serial("bulk validation", () => {
  const stamp = Date.now().toString(36);
  const base = `e2e_spot_bulk_${stamp}`;

  test("creator uploads two drafts and submits them all at once from the queue", async ({ page }) => {
    await login(page, "creator", "/upload");
    await page.setInputFiles("[data-testid=file-input]", [uniqueFixture("e2e_spot.mp4", `${base}_a.mp4`), uniqueFixture("e2e_spot_preview.mp4", `${base}_b.mp4`)]);
    await expect(page.getByTestId("upload-row")).toHaveCount(2);
    await page.getByTestId("start-upload").click();
    await expect(page.getByText(/2 files uploaded to 2 creatives/)).toBeVisible({ timeout: 60_000 });

    await page.goto(`/validation?tab=DRAFT&q=${stamp}`);
    const bar = page.getByTestId("bulk-tab-bar");
    await expect(bar).toContainText("2 drafts not submitted yet");
    // Creators submit; approving is for reviewers.
    await expect(page.getByTestId("bulk-all-approve")).toHaveCount(0);
    await page.getByTestId("bulk-all-submit").click();
    await expect(page.getByTestId("bulk-confirm")).toContainText("Submit all 2 creatives for validation?");
    await page.getByTestId("bulk-confirm-action").click();
    await expectToast(page, "2 creatives submitted for validation.");
    await expect(page.getByTestId("queue-tab-PENDING")).toContainText("2");
  });

  test("manager approves a selected creative, then the rest with Approve all", async ({ page }) => {
    await login(page, "manager", `/validation?tab=PENDING&view=grid&q=${stamp}`);
    const bar = page.getByTestId("bulk-tab-bar");
    await expect(bar).toContainText("2 creatives waiting for validation");

    await page.getByTestId("edit-mode").click();
    await page.getByTestId("reel-card").first().click();
    const selection = page.getByTestId("selection-bar");
    await expect(selection).toContainText("1 selected");
    await selection.getByTestId("bulk-approve").click();
    await expect(page.getByTestId("bulk-confirm")).toContainText("Approve 1 creative?");
    await page.getByTestId("bulk-confirm-action").click();
    await expectToast(page, "1 creative approved.");

    await expect(bar).toContainText("1 creative waiting for validation");
    await page.getByTestId("bulk-all-approve").click();
    await page.getByTestId("bulk-confirm-action").click();
    await expectToast(page, "1 creative approved.");
    await expect(bar).toHaveCount(0);

    await login(page, "viewer", `/approved?q=${stamp}`);
    await expect(page.locator("main ul li a").filter({ hasText: `E2e spot bulk ${stamp}` })).toHaveCount(2);
  });
});
