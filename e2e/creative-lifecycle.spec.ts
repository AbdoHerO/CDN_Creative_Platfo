import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, expectToast, login, uniqueFixture } from "./helpers";

/**
 * The core journey across three roles:
 * creator uploads full + _preview → previews hidden/shown in the library →
 * details page with version selector, preview & download → submit →
 * manager declines (reason required) → creator resubmits → manager approves →
 * viewer finds it among approved creatives.
 */
test.describe.serial("creative lifecycle", () => {
  const stamp = Date.now().toString(36);
  const base = `e2e_spot_${stamp}`;
  const displayName = `E2e spot ${stamp}`;
  let creativeUrl = "";

  test("creator uploads a full video and its _preview; they become one creative", async ({ page }) => {
    await login(page, "creator", "/upload");
    await page.setInputFiles("[data-testid=file-input]", [
      uniqueFixture("e2e_spot.mp4", `${base}.mp4`),
      uniqueFixture("e2e_spot_preview.mp4", `${base}_preview.mp4`),
      uniqueFixture("fake_clip.mp4", `fake_${stamp}.mp4`),
    ]);
    const rows = page.getByTestId("upload-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("PREVIEW");
    await expect(rows.nth(1)).toContainText("Linked to the full version in this batch.");

    await page.getByTestId("start-upload").click();
    await expect(rows.nth(0)).toContainText("Uploaded", { timeout: 60_000 });
    await expect(rows.nth(1)).toContainText("Uploaded", { timeout: 60_000 });
    // Content sniffing rejects the text file disguised as a video.
    await expect(rows.nth(2)).toContainText(/does not look like a valid \.mp4 file/, { timeout: 60_000 });
    await expect(page.getByText(/2 files uploaded to 1 creative/)).toBeVisible();
  });

  test("preview versions are hidden by default and can be shown, labelled PREVIEW · LITE", async ({ page }) => {
    await login(page, "creator", `/library?q=${stamp}`);
    const toggle = page.getByRole("switch", { name: "Show preview versions" });
    // Precondition: the preference is per user and persists; start from "off".
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(toggle).toBeEnabled();
    }
    const cards = page.locator("main ul li a").filter({ hasText: displayName });
    await expect(cards).toHaveCount(1);
    const previewLabel = page.getByText("PREVIEW · LITE", { exact: true });
    await expect(cards.filter({ has: previewLabel })).toHaveCount(0);

    await toggle.click();
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ has: previewLabel })).toHaveCount(1);
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(cards).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("details page offers separate full/preview versions with preview and original download", async ({ page }) => {
    await login(page, "creator", `/library?q=${stamp}`);
    await page.locator("main ul li a").filter({ hasText: displayName }).first().click();
    await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
    creativeUrl = new URL(page.url()).pathname;
    await expect(page.getByTestId("version-FULL")).toContainText(/full version — /i);
    await expect(page.getByTestId("version-PREVIEW")).toContainText(/preview version — /i);
    await expect(page.locator("video")).toBeVisible();

    // The downloaded original is byte-identical to the uploaded file.
    const href = await page.getByTestId("download-selected").getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    const original = readFileSync(join(FIXTURES, "run", `${base}.mp4`));
    const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    expect(hash(Buffer.from(await res.body()))).toBe(hash(original));
    expect(res.headers()["content-disposition"]).toContain(`${base}.mp4`);

    await page.getByTestId("version-PREVIEW").click();
    await expect(page.getByText(`${base}_preview.mp4`).first()).toBeVisible();

    // Wait for the worker to verify integrity.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Verified — identical to the uploaded file")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
  });

  test("creator submits for validation", async ({ page }) => {
    await login(page, "creator", creativeUrl);
    await page.getByTestId("workflow-submit").click();
    await page.getByLabel("Note for reviewers (optional)").fill("Ready for the summer push");
    await page.getByTestId("workflow-confirm").click();
    await expectToast(page, "Status changed to Pending.");
    await expect(page.locator("h1").getByText("Pending")).toBeVisible();
  });

  test("manager must give a reason to decline", async ({ page }) => {
    await login(page, "manager", `/validation`);
    const item = page.getByTestId("queue-item").filter({ hasText: displayName });
    await expect(item).toBeVisible();
    await item.getByTestId("workflow-decline").click();
    await expect(page.getByTestId("workflow-confirm")).toBeDisabled();
    await page.getByLabel("Reason for declining (required)").fill("End card is missing the legal mention");
    await page.getByTestId("workflow-confirm").click();
    await expectToast(page, "Status changed to Declined.");
  });

  test("creator is notified, sees the reason, and resubmits", async ({ page }) => {
    await login(page, "creator", "/notifications");
    await expect(page.getByText(`Declined: ${displayName}`)).toBeVisible();
    await page.goto(creativeUrl);
    await page.getByRole("tab", { name: /Validation history/ }).click();
    await expect(page.getByText("End card is missing the legal mention")).toBeVisible();
    await page.getByTestId("workflow-submit").click();
    await page.getByTestId("workflow-confirm").click();
    await expectToast(page, "Status changed to Pending.");
  });

  test("manager approves; the creative appears among approved creatives for viewers", async ({ page }) => {
    await login(page, "manager", creativeUrl);
    await page.getByTestId("workflow-approve").click();
    await page.getByTestId("workflow-confirm").click();
    await expectToast(page, "Status changed to Approved.");
    await page.getByRole("tab", { name: /Validation history/ }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

    await login(page, "viewer", `/approved?q=${stamp}`);
    await expect(page.locator("main ul li a").filter({ hasText: displayName })).toHaveCount(1);
  });

  test("the activity log records the journey", async ({ page }) => {
    await login(page, "admin", `/activity?q=${stamp}`);
    const table = page.locator("table");
    await expect(table).toContainText("Creative created");
    await expect(table).toContainText("Version uploaded");
    await expect(table).toContainText("Declined");
    await expect(table).toContainText("Approved");
    await expect(table).toContainText("Downloaded");
  });
});
