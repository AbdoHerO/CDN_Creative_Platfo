import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const FIXTURES = join(__dirname, ".fixtures");

export const USERS = {
  admin: { email: process.env.E2E_ADMIN_EMAIL ?? "admin@cmp.local", password: process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2026" },
  manager: { email: "manager@cmp.local", password: process.env.E2E_DEMO_PASSWORD ?? "Demo-Password-2026" },
  creator: { email: "creator@cmp.local", password: process.env.E2E_DEMO_PASSWORD ?? "Demo-Password-2026" },
  viewer: { email: "viewer@cmp.local", password: process.env.E2E_DEMO_PASSWORD ?? "Demo-Password-2026" },
};

export async function login(page: Page, who: keyof typeof USERS, next = "/dashboard") {
  await page.context().clearCookies();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", USERS[who].email);
  await page.fill("#password", USERS[who].password);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Copy a fixture under a unique name so each run creates distinct creatives. */
export function uniqueFixture(source: string, targetName: string) {
  const dir = join(FIXTURES, "run");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, targetName);
  copyFileSync(join(FIXTURES, source), target);
  return target;
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
