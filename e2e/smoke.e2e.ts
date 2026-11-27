import { expect, test } from "@playwright/test";
import { signedInUser, newTestEmail, signIn } from "./helpers";

// Smoke tests for the core flows (issue #110). They check "does it still
// work end to end", not every edge case: unit tests cover the logic.
// The titles come from e2e/tmdb-stub.mjs.

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

test("dev login signs in and lands on Discover with posters", async ({ page }) => {
  await signIn(page, newTestEmail("login"));
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add Stub .* to a list$/ }).first()).toBeVisible();
});

test("Discover: add a movie to Want to Watch and see it on My Movies", async ({ page }) => {
  await signIn(page, newTestEmail("add"));
  await page.goto("/search");

  await page.getByRole("button", { name: /^Add Stub Movie \d+ to a list$/ }).first().click();
  const sheetTitle = page.getByRole("heading", { name: /^Add "Stub Movie \d+"$/ });
  await expect(sheetTitle).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheetTitle).toBeHidden();

  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "My Movies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Stub Movie \d+$/ }).first()).toBeVisible();
});

test("What to Watch suggests titles and Shuffle keeps working", async ({ page }) => {
  await signIn(page, newTestEmail("mood"));
  await page.goto("/what-to-watch");
  await expect(page.getByRole("heading", { name: "What to Watch" })).toBeVisible();

  const picks = page.getByRole("button", { name: /^Add Stub .* to a list$/ });
  await expect(picks.first()).toBeVisible();
  await page.getByRole("button", { name: "Shuffle" }).click();
  await expect(picks.first()).toBeVisible();
});

test("Watch Together: two friends see shared picks", async ({ browser }) => {
  const alice = await signedInUser(browser, "alice");
  const bob = await signedInUser(browser, "bob");
  try {
    // Alice sends a friend request by email and Bob accepts it (the same API calls
    // the Profile page makes; the Profile UI itself isn't what's under test here).
    const sent = await alice.page.request.post("/api/connections", { data: { email: bob.email } });
    expect(sent.ok()).toBeTruthy();
    const { pending } = await (await bob.page.request.get("/api/connections")).json();
    expect(pending).toHaveLength(1);
    const accepted = await bob.page.request.patch(`/api/connections/${pending[0].id}`);
    expect(accepted.ok()).toBeTruthy();

    const { friends } = await (await alice.page.request.get("/api/connections")).json();
    expect(friends).toHaveLength(1);

    await alice.page.goto(`/watch-together/${friends[0].friend.id}`);
    await expect(alice.page.getByRole("heading", { name: "Watch Together" })).toBeVisible();
    await expect(alice.page.getByRole("heading", { name: "Tonight for you both" })).toBeVisible();
    await expect(
      alice.page.getByRole("button", { name: /^Add Stub .* to a list$/ }).first(),
    ).toBeVisible();
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
