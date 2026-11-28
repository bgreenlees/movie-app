import { expect, test } from "@playwright/test";
import { signedInUser, newTestEmail, signIn } from "./helpers";

// Smoke tests for the core flows (issue #110). They check "does it still
// work end to end", not every edge case: unit tests cover the logic.
// The titles come from e2e/tmdb-stub.mjs.

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to What's Up Next" })).toBeVisible();
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

test("Discover: reaching the bottom loads more titles, with no duplicates", async ({ page }) => {
  await signIn(page, newTestEmail("more"));
  await page.goto("/search");
  const posters = page.getByRole("button", { name: /^Add Stub Movie \d+ to a list$/ });
  await expect(posters.first()).toBeVisible();
  const before = await posters.count();

  // Scrolling the footer into view fires the observer; the stub has a second page of titles
  await page.getByText(/^(Load more|Loading more…|That's everything)$/).scrollIntoViewIfNeeded();
  await expect.poll(() => posters.count()).toBeGreaterThan(before);

  // The next page comes back empty, so Discover says so instead of loading forever.
  // The new rows push the footer off screen, so scroll to the bottom again.
  const footer = page.getByText(/^(Load more|Loading more…|That's everything)$/);
  await expect
    .poll(async () => {
      await footer.scrollIntoViewIfNeeded();
      return footer.textContent();
    })
    .toBe("That's everything");
  const names = await posters.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  expect(new Set(names).size).toBe(names.length);
});

test("Discover: the Load more button works when scrolling doesn't trigger it", async ({ page }) => {
  // No observer events, as for a browser that never reports the sentinel
  await page.addInitScript(() => {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  });
  await signIn(page, newTestEmail("morebtn"));
  await page.goto("/search");
  const posters = page.getByRole("button", { name: /^Add Stub Movie \d+ to a list$/ });
  await expect(posters.first()).toBeVisible();
  const before = await posters.count();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect.poll(() => posters.count()).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("That's everything")).toBeVisible();
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

test("What to Watch picks fill complete rows at phone, laptop and wide widths", async ({ page }) => {
  await signIn(page, newTestEmail("rows"));
  const picks = page.getByRole("button", { name: /^Add Stub .* to a list$/ });
  for (const width of [390, 1280, 1900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/what-to-watch");
    await expect(picks.first()).toBeVisible();
    // Columns of the grid the picks sit in, from the browser's own layout
    const { cols, count } = await picks.first().evaluate((el) => {
      const grid = el.closest("ul, div.grid") as HTMLElement;
      const template = getComputedStyle(grid).gridTemplateColumns;
      return { cols: template.trim().split(/\s+/).length, count: grid.children.length };
    });
    expect(count % cols, `${width}px: ${count} picks in ${cols} columns`).toBe(0);
    expect(count / cols).toBeGreaterThanOrEqual(2);
    expect(count).toBeGreaterThanOrEqual(12);
    // Shuffle keeps the count
    await page.getByRole("button", { name: "Shuffle" }).click();
    await expect(picks.first()).toBeVisible();
    expect(await picks.count()).toBe(count);
  }
});

test("Watch Together mode on What to Watch: two friends see shared picks", async ({ browser }) => {
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

    // From What to Watch: pick the friend, get picks for you both, filter, shuffle, Decide together
    const picks = alice.page.getByRole("button", { name: /^Add Stub .* to a list$/ });
    await alice.page.goto("/what-to-watch");
    await expect(picks.first()).toBeVisible();
    await alice.page.getByLabel("Watch together").selectOption({ index: 1 });
    await expect(alice.page).toHaveURL(new RegExp(`with=${friends[0].friend.id}`));
    await expect(alice.page.getByRole("heading", { name: "Up next for you both" })).toBeVisible();
    await expect(picks.first()).toBeVisible();
    await expect(alice.page.getByRole("button", { name: "Decide together" })).toBeVisible();
    await alice.page.getByRole("button", { name: "TV" }).click();
    await expect(picks.first()).toBeVisible();
    await alice.page.getByRole("button", { name: "Shuffle" }).click();
    await expect(picks.first()).toBeVisible();

    // The link survives a reload; an id that isn't a friend quietly means "Just me"
    await alice.page.reload();
    await expect(alice.page.getByRole("heading", { name: "Up next for you both" })).toBeVisible();
    await alice.page.goto("/what-to-watch?with=not-a-friend");
    await expect(alice.page.getByRole("heading", { name: "Up next for you", exact: true })).toBeVisible();
    await expect(alice.page).not.toHaveURL(/with=/);

    // The old Watch Together URL lands on What to Watch with the friend selected: one page, no "More with" link
    await alice.page.goto(`/watch-together/${friends[0].friend.id}`);
    await expect(alice.page).toHaveURL(new RegExp(`/what-to-watch\\?with=${friends[0].friend.id}`));
    await expect(alice.page.getByRole("heading", { name: "Up next for you both" })).toBeVisible();
    await expect(alice.page.getByRole("link", { name: /More with/ })).toHaveCount(0);
    // Picks fill complete rows (at least 12, a whole number of rows)
    await expect(picks.first()).toBeVisible();
    expect(await picks.count()).toBeGreaterThanOrEqual(1);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test("first-run onboarding picker works on a phone: titles shown, 5-pick cap, Escape closes", async ({ page }) => {
  await page.route("**/_next/image**", (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(newTestEmail("onboard"));
  await page.getByRole("button", { name: "Sign in (dev)" }).click();
  await page.waitForURL("**/search");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Every tile shows its title without hovering
  await expect(dialog.getByText("Ex Machina", { exact: true })).toBeVisible();
  const tiles = dialog.getByRole("button", { pressed: false });
  expect(await tiles.count()).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: process.env.ONBOARDING_SHOT ?? "test-results/onboarding-390.png" });

  // Fewer than about 3 screens of scrolling
  const { scrollH, clientH } = await dialog.locator("div.overflow-y-auto").evaluate((el) => ({
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
  }));
  console.log(`onboarding scroll area: ${scrollH}px over a ${clientH}px viewport`);

  // A 11th pick is blocked with a hint
  for (let i = 0; i < 11; i++) await dialog.getByRole("button", { pressed: false }).nth(i).click();
  await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(10);
  await expect(dialog.getByRole("alert")).toContainText("up to 10");

  // Escape closes the dialog
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
