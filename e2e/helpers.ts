import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

/** A throwaway dev-login address. The `e2e-` prefix is what global-teardown deletes. */
export function newTestEmail(label: string): string {
  return `e2e-${label}-${randomBytes(4).toString("hex")}@example.test`;
}

/**
 * Signs in through the real "Dev login" form on /login, then skips the
 * first-run onboarding sheet (it would cover the page) through its API.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  // Poster art comes from image.tmdb.org via /_next/image; the stub has no images,
  // and the tests shouldn't depend on the network.
  await page.route("**/_next/image**", (route) => route.abort());

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign in (dev)" }).click();
  await page.waitForURL("**/search");
  const skipped = await page.request.post("/api/onboarding", { data: { skipped: true } });
  expect(skipped.ok()).toBeTruthy();
}

/** A fresh, signed-in browser context + page (for tests that need two people). */
export async function signedInUser(
  browser: Browser,
  label: string,
): Promise<{ context: BrowserContext; page: Page; email: string }> {
  const email = newTestEmail(label);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page, email };
}
