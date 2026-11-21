# Design review: UI, UX and visuals (issue #11)

_Reviewed 2026-11-21 against `main` @ `154b01d`, running locally on the Neon **dev** branch, plus a read-only look at https://whatsupnext.site._
_No app code was changed. Screenshots are in [`design/`](design/) and are named `<page>-<desktop|mobile>-<dark|light>.png` (desktop = 1440×900 viewport, mobile = 390×844)._

## TL;DR

The app does a lot, and the data behind it is good: TMDB posters, providers, cast and news. The visuals feel thin for three reasons:

1. **The poster grid is the whole UI.** Each card is a poster, then four unlabeled icon buttons, then a full-width purple "Add" button, repeated 16–24 times a screen. Titles, years and status are missing from the card, and the big backdrop art is used nowhere.
2. **There's no design system.** There are 455 inline `style={{…}}` objects, 5 different corner radii, 9px–13.5px "small" text, one-off hex colors and an unused display font. Each page solves spacing, empty states and buttons its own way.
3. **First-run and edge states are rough.** The **Create Account button is invisible on production**. The 404 is a white unstyled default. Empty and error states are a single line of grey text.

The proposed direction is **"Cinema dark"**. Keep the black-and-purple identity, but let the art carry the page: backdrop heroes, captioned poster cards with a single overflow action, a real type scale using the Playfair font that's already loaded, and tokens in Tailwind v4 `@theme` so pages stop hand-rolling styles.

---

## How this was tested

- Pages: landing, login, register, onboarding, Discover (movies), Discover TV (`/tv`), search results, search suggestions, New Releases, News, My Movies, My TV, Profile, profile menu, movie and TV detail pages (`/movie/[id]`, `/tv/[id]`), the detail modal, the Add modal, Watch Together, 404s, and empty states for a brand-new user.
- Every main page was captured at desktop and mobile widths, in dark and light themes.
- Accessibility checks: a keyboard Tab walk, the accessibility tree from Orca's browser snapshot, tap-target sizes measured in the DOM at 390px, and WCAG contrast computed from the CSS tokens.
- **Sign-in caveat:** the task said to register with email/password, but **the app has no credentials provider**. `lib/auth.ts` only configures Google, and `RegisterForm` just renders the Google button. The README ("email/password fallback") and the `password` column in the schema are leftovers. To review signed-in pages I created two test users in the **dev** DB (`design-review-11@example.test` with data, `design-review-11-empty@example.test` with none). I then minted a local NextAuth session cookie for them with the dev `AUTH_SECRET`. I added watchlist entries through the Add modal and the same `/api/watchlist` endpoints the UI calls. This was a local-only testing workaround, not an app change. Either update the docs, or add a dev-only credentials provider so future reviews and E2E tests can sign in (follow-up F14).

---

## Findings, ranked by impact

Impact = how many users hit it × how badly it hurts. **P0** = broken or blocking, **P1** = hurts the core loop (find → add → track) or accessibility, **P2** = polish and consistency.

### P0: broken

| # | Finding | Evidence |
|---|---|---|
| 1 | **"Continue with Google" is invisible on `/register`.** The register card is hard-coded `bg-white`, but `LoginForm`'s button uses `#f5f5f7` text on a 7%-white background, so the contrast is **1.09:1**. The landing page's main CTA, "Get Started", goes here, so every new visitor sees an empty white box. Confirmed on production. | `register-*.png`, `prod-register-mobile.png` |
| 2 | **The 404 page is Next's unstyled default:** white, no nav, no way back. `/movie/<bad id>` (a shared deeplink) lands here. The app has no `not-found.tsx`, `error.tsx` or `loading.tsx` anywhere. | `notfound-movie-desktop-dark.png` |

### P1: core loop and accessibility

| # | Finding | Evidence |
|---|---|---|
| 3 | **Cards have no title, year or status text.** The title only appears inside the poster art. That fails for text-only posters ("Andromeda Strain", foreign-language art), for scanning, and for screen readers in the grid. My TV shows a tiny "WATCHING" badge plus "S03 E01" in muted 13px text, with no progress indicator. | `discover-*`, `my-tv-*` |
| 4 | **Every card repeats four unlabeled icons (✕ 👎 👍 ♡) and a full-width "Add" button.** That's 120+ purple buttons a screen. The icons have aria-labels but no visible labels. "✕ = Not interested" can't be guessed, and nobody knows why they would rate a film they haven't seen. Attention goes to the controls instead of the art. | `discover-desktop-*.png`, `search-results-*` |
| 5 | **No visible focus indicator.** Inputs use `focus:outline-none` (13 places) and there are no `focus-visible` styles anywhere, so keyboard focus is the 1px browser default. It's barely visible on black (see the faint outline on "TV Shows" in `focus-discover-desktop-dark.png`). There's no skip link either: it takes 13 Tabs to get past the nav to the first card. | `focus-discover-desktop-dark.png` |
| 6 | **Muted text fails contrast in dark mode.** `--text-muted #6e6e73` measures **3.90:1** on the page, **3.63:1** on cards and **3.25:1** on the segmented-control track (needs 4.5:1). It's used for inactive tabs ("Watched", "Finished"), dates, helper text and empty states. The landing/login tagline `#3a3a3c` on black is **1.85:1**. White on the dark-mode accent `#a855f7`, the label of every primary button, is **3.96:1**. | `my-movies-desktop-dark.png`, `landing-*` |
| 7 | **Modals aren't real dialogs.** There's no `role="dialog"`/`aria-modal` and no focus trap, and while the onboarding overlay is open the whole Discover page behind it stays in the accessibility tree and tab order. The modal close button has no hover or focus state. | a11y snapshot of the onboarding overlay |
| 8 | **Mobile spends its first ~200px on chrome.** The nav stacks the logo row, a full-width search bar and a horizontally scrolling link strip with a visible scrollbar. On My Movies and My TV the active tab ("My M…") is scrolled off-screen, so users can't see where they are. | `my-movies-mobile-*`, `news-mobile-dark.png` |
| 9 | **Grid density changes from page to page on mobile.** Discover and search use 2 columns, but My Movies and My TV use **1 full-width poster per screen**, so a 20-film watchlist takes 20 screens of scrolling. On desktop it goes the other way: Discover has 8 columns and My Movies 5. | `my-movies-mobile-light.png` vs `discover-mobile-dark.png` |
| 10 | **Tap targets are too small on mobile.** On Discover at 390px, **306 of 363** controls are under 44px. The rating icons are **30×45px**, four of them sit edge to edge, and ✕ ("Not interested") is next to 👎, so mis-taps are likely. The ⓘ info button is 36×36 and My TV's Update/Remove are 33px tall. | DOM measurement |
| 11 | **Empty, loading and error states are a single line of grey text.** "Loading..." appears on 7 pages (only Search and News have skeletons). Empty states have no illustration and no button: My Movies is plain text, while My TV uses a dashed box. Errors are mostly swallowed with `catch {}`. Watch Together for an unconnected user just says "Not connected". | `empty-*.png`, `error-watch-together-desktop-dark.png` |
| 12 | **The detail page (`/movie/[id]`, `/tv/[id]`) ignores the backdrop.** It's the most "cinematic" page and the one people share, yet it's a small poster on a flat background. Signed-in users also lose the main nav: they get the public header with "Open App". | `movie-detail-*`, `tv-detail-*` |

### P2: consistency and polish

| # | Finding |
|---|---|
| 13 | **Navigation and IA:** "Discover" has its own Movies/TV toggle, but there's also an orphaned `/tv` page ("TV Recommended for You") that nothing links to. Watch Together is only reachable through Profile → Friends. Search results highlight "Discover". The feature-request button uses a lightbulb icon that reads as a theme toggle. |
| 14 | **Profile menu:** the row labelled "Light Mode" has a switch that is *on* while in dark mode. "Sign Out" is styled muted, so it looks disabled. (`profile-menu-desktop-dark.png`) |
| 15 | **Typography:** `html { font-size: 18px }` scales every rem, so Tailwind's `text-xs` is 13.5px while literal `text-[9px]`/`[10px]` labels are tiny. Playfair Display is downloaded but never used (`--font-display` is unreferenced). Headings are all Lato bold, with no hierarchy beyond size. |
| 16 | **Color:** the brand gradient (purple → blue) is only on the landing and login pages. News source badges use unrelated oranges and reds (`#e67e22`, `#e74c3c`, `#ff6b35`). Light theme is mostly fine, but it's opt-in only (`prefers-color-scheme` is ignored), and the theme toggle is buried in the profile menu. |
| 17 | **Shape and spacing:** five radii are in use (`rounded`, `-md`, `-lg`, `-xl`, `-full`, plus a 20px glass card). Card padding, gaps and header spacing differ per page. Register is a white card on black while Login is dark glass: the two auth pages look like different products. |
| 18 | **Styling architecture:** 455 inline `style` objects reference CSS vars directly. `tailwind.config.ts` is a v3-style config that Tailwind v4 ignores (there's no `@config`), so `bg-background` etc. never existed. This is the root cause of the inconsistency above, and the reason to do tokens first. |
| 19 | **Onboarding:** the 5-column grid is left-aligned inside a 6xl container at 1440px, leaving a dead strip on the right. Selected posters are good (check + purple ring). "Let's Go" stays faded until 3 picks, but its disabled state isn't explained beyond the counter. |
| 20 | **Motion:** the landing and login orbs animate forever with no `prefers-reduced-motion` guard. |
| 21 | **Add modal:** choosing "Want to Watch" still shows Rating, Review, Platform and Watch type. Those only make sense for "Watched". (`add-modal-desktop-light.png`) |
| 22 | **Search suggestions** are good (grouped, with types and people avatars), but title rows have no poster thumbnail, truncate at 256px, and aren't keyboard-navigable (no arrow keys, no `listbox` role). The desktop search submit button has no accessible name. |

### What's working (keep it)

- **News** is the best-looking page: 16:9 images, clear hierarchy and a real skeleton loader. Use it as the model for other pages.
- The **onboarding picker** is a strong, art-led first-run moment.
- **Detail modal and detail page content** is rich: tagline, crew, where-to-watch chips with provider logos, and cast photos.
- **Alt text** is in good shape: posters use the title, decorative provider logos correctly use `alt=""`, and icon buttons have aria-labels.
- The **light theme** holds up across pages, and its accent `#7c3aed` passes contrast (5.70:1).

---

## Proposed visual direction: "Cinema dark"

**Principles**
1. **Art first, chrome second.** The UI should frame posters and backdrops, not compete with them: one accent action per card, everything else on hover or in an overflow menu.
2. **One system.** Every color, size, radius and space comes from a token. No inline hex values and no inline `style` for design values.
3. **Readable by default.** All text is at least 4.5:1, focus is always visible, and touch targets are at least 44px.

### Design tokens

Define these with Tailwind v4 `@theme` in `globals.css`, so they become utilities (`bg-surface`, `text-muted`, `rounded-card`…) and work with `[data-theme]`.

**Palette, dark (default)**

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--color-bg` | `#0b0b0f` | page (slightly blue-black, less harsh than #000) | – |
| `--color-surface` | `#15151c` | cards, nav, modals | – |
| `--color-surface-2` | `#1f1f29` | hover, segmented track, inputs | – |
| `--color-border` | `#2e2e3a` | hairlines | – |
| `--color-text` | `#f4f4f6` | body and headings | 17.9:1 on bg |
| `--color-text-muted` | `#a1a1aa` | secondary text (**replaces #6e6e73**) | 7.7:1 on bg, 7.1:1 on surface, 6.4:1 on surface-2 |
| `--color-accent` | `#7c3aed` | primary buttons, active nav, selection (same in both themes) | white text 5.7:1 (today's `#a855f7` is 3.96:1) |
| `--color-accent-hover` | `#6d28d9` | | |
| `--color-accent-text` | `#c4b5fd` | accent as *text/links* on dark | 10.6:1 on bg |
| `--color-focus` | `#c4b5fd` | 2px focus ring + 2px offset | |
| `--color-success` / `--color-warning` / `--color-danger` | `#34d399` / `#fbbf24` / `#f87171` | status, Danger Zone | all ≥ 7.1:1 on bg |
| `--gradient-brand` | `linear-gradient(135deg,#a855f7,#3b82f6)` | logo, hero CTA, onboarding only | |
| `--scrim-bottom` | `linear-gradient(to top, rgb(0 0 0 / .85), transparent 60%)` | text over art | |

**Palette, light:** `bg #f6f6f8`, `surface #ffffff`, `surface-2 #ececf1`, `border #d9d9e0`, `text #18181b`, `text-muted #52525b` (7.7:1 on white), `accent #7c3aed` (5.7:1 with white), `accent-text #6d28d9` (7.1:1), `focus #6d28d9`. Follow `prefers-color-scheme` until the user picks a theme.

**Type**: set `html { font-size: 16px }` and use rems from here.

| Token | Size / line height | Font | Use |
|---|---|---|---|
| `display` | 40/44 (mobile 32/36) | Playfair Display 700 | landing hero, detail-page title |
| `h1` | 30/36 (mobile 26/32) | Lato 700 | page titles |
| `h2` | 20/28 | Lato 700 | section rows ("New on Streaming") |
| `title` | 15/20 | Lato 700 | card titles, modal headers |
| `body` | 16/24 | Lato 400 | overviews, forms (16px also stops iOS zooming on input focus) |
| `meta` | 13/18 | Lato 400 | year · runtime · S2 E3 |
| `label` | 12/16, +0.06em, uppercase | Lato 700 | section eyebrows, badges (**minimum size; drop 9–11px**) |

**Spacing** uses a 4px base: `1=4 2=8 3=12 4=16 6=24 8=32 12=48 16=64`. Page gutter is 16px on mobile, 24px on tablet and 32px on desktop. Gaps between sections are 48px, card grid gap is 16px (12px on mobile), and card body padding is 12px.

**Radii:** `sm 6px` (chips, badges) · `md 10px` (buttons, inputs) · `card 12px` (cards, posters) · `xl 20px` (modals, sheets) · `full` (avatars, pills). Retire `rounded` (4px) and `rounded-lg` on cards.

**Elevation:** `shadow-card: 0 1px 2px rgb(0 0 0/.3)` and `shadow-pop: 0 12px 32px rgb(0 0 0/.45)` for menus and modals. In light mode, replace shadows with borders.

**Motion:** 150ms for hover, 200ms ease-out for overlays, and none under `prefers-reduced-motion`.

### Key component treatments

- **PosterCard** (shared by movies and TV, replacing `MovieCard` and `TVShowCard`)
  - 2:3 poster with radius `card`. Underneath sits a **title (1 line, `title`) and a meta line** (`2024 · Movie`, or for TV `S2 E3` plus a thin 3px progress bar in the accent color).
  - The top-left **status chip** ("Watching", "Want", "Seen ★") only shows on My lists.
  - **One action:** a 36px circular "+" (or "✓" when already on a list) at the poster's bottom-right on a scrim. Tapping it opens the Add sheet.
  - Ratings (✕ 👎 👍 ♡) move into a **"⋯" menu** on hover/long-press and into the detail view. On "Watched" lists, show the user's existing rating as a small badge instead.
  - The whole poster opens details (a link to `/movie/[id]`, with the modal as an enhancement), which removes the separate ⓘ button. The trailer goes in the detail view.
- **Grid:** one responsive rule for every list, `grid-cols-[repeat(auto-fill,minmax(150px,1fr))]` on desktop and fixed **3 columns on mobile** (2 on screens under 360px).
- **Rows ("shelves")** for Discover, New Releases and Profile-driven rows: a horizontal scroll-snap row with an `h2` and a "See all" link, so the home screen shows several kinds of picks instead of one endless grid.
- **Nav:** on desktop, keep the top bar, but put the logo mark with the gradient in front, give the active link an underline plus `text-accent-text` (not a filled pill), and collapse search to an icon that expands. On mobile, use a **bottom tab bar** (Discover · New · Search · My Movies · My TV, all 44px-plus), a compact top bar (logo + avatar) and search as a full-screen sheet. News and Watch Together move into the avatar menu or a Discover shelf.
- **Buttons:** `primary` (accent fill), `secondary` (surface-2 fill), `ghost` (text only) and `danger` (danger text, filled only to confirm). Heights are 44px on mobile and 36px on desktop, with radius `md`. Each card gets one primary button at most.
- **Segmented control:** the active segment is surface with full-contrast text, inactive segments use `text-muted` (now passing), and the container is at least 44px tall.
- **Dialog/Sheet:** a single primitive with `role=dialog`, `aria-modal`, a focus trap, Esc, a scrim and `xl` radius. On mobile it's a **bottom sheet**. All modals (Add, Detail, Feedback, Trailer, Onboarding) use it.
- **States kit:**
  - `<Skeleton>`: a poster-shaped shimmer in the real grid layout.
  - `<EmptyState icon title body action>`: e.g. "Your watchlist is empty" plus a **Browse Discover** button.
  - `<ErrorState retry>`.
  - Branded `not-found.tsx` and `error.tsx` that keep the nav.
- **Focus:** a global `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px }`, plus a "Skip to content" link.

### Before → after

1. **Discover card**
   - *Before:* a poster with a black "▶ Trailer" bar across its bottom, then a row of four 30px outline icons, then a full-width purple **Add** button. 24 of these per screen form a purple stripe pattern, and you can't read the titles without squinting at the poster art.
   - *After:* a clean poster with rounded corners and a soft shadow. Underneath are the title in bold and "2025 · Movie" in muted text. A small circular "+" sits on the poster's bottom-right corner over a subtle scrim, and becomes a ✓ with a status chip once added. Ratings live in the "⋯" menu. The page reads as a wall of art with tidy captions, and the only purple is the "+" buttons and the active nav.

2. **Movie detail page (`/movie/693134`)**
   - *Before:* a plain header with "Open App", a 165px poster beside the title on a flat black or white page, and where-to-watch chips and cast below.
   - *After:* a **full-bleed backdrop hero** (TMDB `backdrop_path`, w1280) about 60vh tall with a bottom scrim. The poster overlaps the hero's lower edge, with the title in **Playfair Display 40px**, then "2024 · 2h 46m · Sci-Fi" in meta, then the primary button ("+ Want to Watch" / "✓ On your list ▾") with Trailer and Share as secondary buttons. Signed-in users keep the main nav. Below sit shelves: Where to watch (your services highlighted first), Cast (a horizontal scroll), and More like this. This page becomes the template for the detail modal and for the iOS and tvOS apps.

3. **My TV on mobile**
   - *Before:* three cramped tabs ("Want to Watch" wraps onto two lines), then one full-screen poster per show with "S03 E01" in 13px grey and Update and Remove buttons side by side.
   - *After:* a 44px segmented control with short labels (Watching · Up next · Done) and a **3-column grid**, with each card captioned "The Bear" / "S3 · E1" plus a progress bar. Tapping a card opens a bottom sheet with a large "**Mark E2 watched**" button, a season/episode stepper and a "Remove from list" text button at the bottom in danger red. When the list is empty, it shows "Nothing in progress" with a **Find a show** button.

---

## Proposed implementation follow-ups

These are listed in the PR body as small, independently mergeable chunks, in suggested order. The owner decides which become issues. Tokens come first because every later chunk builds on them.

| # | Chunk | Fixes | Size |
|---|---|---|---|
| F1 | **Fix the invisible Register button.** Make `/register` match `/login` (dark glass card), or give `LoginForm` theme-aware colors. | #1 | XS |
| F2 | **Branded `not-found.tsx` + `error.tsx`** (root and `(main)`), keeping the nav and adding a "Back to Discover" button. | #2, #11 | S |
| F3 | **Design tokens:** move the palette, type scale, spacing, radii and shadows into Tailwind v4 `@theme`; set `html` to 16px; delete the dead `tailwind.config.ts`; follow `prefers-color-scheme`. No visual redesign yet, just new values, and it fixes muted contrast globally. | #6, #15, #16, #18 | S |
| F4 | **Focus + skip link:** a global `:focus-visible` ring, removing the `focus:outline-none` uses, and a "Skip to content" link. | #5 | XS |
| F5 | **`Dialog` primitive** (role, aria-modal, focus trap, bottom sheet on mobile), then migrate Modal, Feedback, Trailer, Add and Detail to it one PR at a time. | #7 | M |
| F6 | **States kit:** `Skeleton`, `EmptyState` and `ErrorState`, replacing the 7 "Loading..." strings and the bare empty messages; stop swallowing fetch errors. | #11 | S |
| F7 | **`PosterCard` v2:** title and meta caption, one "+" action, ratings moved into a "⋯" menu, a progress bar for TV; replaces `MovieCard` and `TVShowCard`. | #3, #4, #10 | M |
| F8 | **One responsive grid** for all lists (3 columns on mobile). | #9 | XS (after F7) |
| F9 | **Mobile nav:** bottom tab bar, compact top bar, search as a sheet; also fixes the hidden active tab. | #8, #13 | M |
| F10 | **Detail page hero:** backdrop, Playfair title, keep the main nav for signed-in users; reuse it in the detail modal. | #12 | M |
| F11 | **IA cleanup:** remove or redirect the orphaned `/tv`, give Watch Together a proper entry point, change the feedback icon to a chat/megaphone with a tooltip, fix the theme toggle label, make Sign Out full contrast. | #13, #14 | S |
| F12 | **Add sheet:** show the watch details only when the status is "Watched". | #21 | XS |
| F13 | **Search suggestions:** listbox role, arrow keys, poster thumbnails, an accessible name for the search button. | #22 | S |
| F14 | **Dev/test sign-in:** either fix the README and remove the "email/password" claim, or add a credentials provider enabled only when `NODE_ENV !== "production"`, so reviews and future Playwright tests can sign in. | sign-in caveat | S |
| F15 | **Polish:** `prefers-reduced-motion` for the orbs, center the onboarding grid, map News source badges to the tokens. | #16, #19, #20 | XS |

Do F1, F2 and F4 first: they're tiny and fix real breakage. Then F3, the base everything else uses. F7 and F10 make the biggest visual difference and are the look the iOS/tvOS apps should copy.

## Screenshot index

| Area | Files |
|---|---|
| Public | `landing-*`, `login-*`, `register-*`, `prod-register-mobile.png` (production) |
| First run | `onboarding-*`, `empty-discover-*`, `empty-my-movies-*`, `empty-my-tv-*` |
| Discover | `discover-*`, `tv-discover-*`, `search-results-*`, `search-suggestions-desktop-dark.png`, `focus-discover-desktop-dark.png` |
| Browse | `new-releases-*`, `news-*` |
| My lists | `my-movies-*`, `my-tv-*`, `add-modal-desktop-light.png`, `detail-modal-desktop-dark.png` |
| Detail | `movie-detail-*`, `tv-detail-*` |
| Account | `profile-*`, `profile-menu-desktop-dark.png` |
| Errors | `notfound-movie-desktop-dark.png`, `error-watch-together-desktop-dark.png` |

_The round "N" in the bottom-left corner of local screenshots is the Next.js dev-tools badge; it isn't part of the app._
