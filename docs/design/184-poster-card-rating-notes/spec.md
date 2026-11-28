# #184: Poster card with rating and notes (retire the + menu)

**Recommended: Option D (owner direction, 2026-11-28): all five controls on one row.** Option A below stays as the fallback.

All images are real screenshots of the local app (dev login, Discover, dark theme) at 390px and 1280px. The mockups were made by adding markup to the live card in the browser, using the app's own classes and tokens. The dashed yellow outline and the `NEW` tag are annotations only. Don't build them.


## Option D: five controls on one row (recommended)

Images `30-…` to `35-…`. Real screenshots with the new markup added to the live card. The yellow `NEW` / `MOVED` tags are annotations only.

```
[ ▶ Trailer ] [ 👎 👍 ♥ ] [ + Add to Watchlist ]          ← one row, 44px targets
  ✎ Add a note                                           ← opens only on tap
```

Owner's order is Trailer, 👎, 👍, ♥, + Add to Watchlist. I kept it: Trailer is the least committal, the rating is the middle, and the filled primary button ends the row where the eye finishes. Share leaves the row.

| Width | Trailer | Rating | Add button | Fits? |
|---|---|---|---|---|
| 1280 (card is 672px) | `▶ Trailer` with label, 106px | 142px | `+ Add to Watchlist` / `✓ On Your List`, 147–169px | Yes, with room to spare |
| 390 (card content 316px) | icon only, 44×44 | 142px | `+ Watchlist` / `✓ On List`, 118px | Yes, no scroll (`31-…390`) |
| 360 | icon only | 142px | `+ Watchlist`, 88px | Yes, but tight (`35-D-narrow-360-rated`) |

At 390 the full label "+ Add to Watchlist" does **not** fit (it needs about 135px, there are 118). So below 420px of viewport the label is the short one. Say if you'd rather keep the long label and drop something else.

### Build (`MovieDetailModal.tsx`, `TVShowDetailModal.tsx`)
- **Row container:** `flex items-center gap-1.5`, replacing today's `flex items-center gap-2 mb-4` actions div (keep `mb-4` when no note line follows).
- **Trailer:** same `TrailerButton` with `heroSecondaryButton` classes. Below `sm` render the play icon only: `w-11 px-0`, label in `<span className="hidden sm:inline">`, plus `aria-label="Trailer"`. 44×44.
- **Rating:** `DetailRating` unchanged except `gap-0` instead of `gap-1` (saves 8px; buttons stay `h-11 min-w-11`). Add `shrink-0`. Behaviour as in Option A below (PATCH or POST as Watched, tap again clears).
- **Add button:** `heroPrimaryButton` (or `heroSecondaryButton` with `✓` when on the list) with `min-w-0 flex-1 px-2 sm:flex-none sm:px-5`, `text-sm sm:text-[15px]`. Label: `+ <span className="hidden min-[420px]:inline">Add to </span>Watchlist`, and `✓ On <span className="hidden min-[420px]:inline">Your </span>List`. Wrap the label in one `<span>` so the button's `gap-2` doesn't add gaps between words. Behaviour as in Option A: adds as Want to Watch straight away, no menu.
- **Share:** moves out of the row, see below.
- **Note:** a line under the row, same three states as Option A (copy, `textarea`, saving, `line-clamp-2` summary, 2000 characters). State 1 is `Add a note` with a pencil, `mt-1 h-11 px-1 text-sm font-medium text-accent-text`. States 2 and 3 get `mt-2`. Nothing else is shown until the user taps it.
- No "Seen it?" label: the 👎 👍 ♥ group already has `aria-label="Your rating for {title}"` and tooltips.

### Where Share goes
1. **Recommended: header icon, left of Close** (`ShareButton variant="icon"`, shown in the screenshots). Both header icons get a 44×44 hit area without making the header taller: `-my-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:text-text`, and Close gets `-mr-2` so the visual position stays. The icon already exists in `ShareButton`. Share lives next to Close, which is where phones put it too.
2. **Alternative: a text link at the bottom of the card**, `Share this title` after Where to Watch / Top cast. Out of the way, but you'd have to scroll to find it. Choose this only if the header feels crowded with a long title (it truncates, so it shouldn't).

### TV card
Identical, with `"tv"` for the rating save and the trailer (`33-D-tv-card-*`, `34-…`). Rating marks the show Finished, as in open question 3 of the PR.

### Why D beats A
- The button row is the one place the owner already likes, and D puts the rating in it instead of adding a second row.
- The card is 48px shorter on a phone before any note, and there is no "Seen it?" label to read.
- Cost: on a phone the Trailer label and the "Add to" words are dropped, and Share moves.

## Today

| | 390 | 1280 |
|---|---|---|
| Movie card (tap a poster) | `01-before-movie-card-390.jpg` | `01-before-movie-card-1280.jpg` |
| "+" menu (`AddMovieModal`) | `02-before-plus-menu-390.jpg` | `02-before-plus-menu-1280.jpg` |
| TV card | `03-before-tv-card-390.jpg` | `03-before-tv-card-1280.jpg` |

## The three placements

| Option | Where | Verdict |
|---|---|---|
| **A** (fallback) `10-option-A-under-buttons-*` | One row under the button row: `SEEN IT?` label, 👎 👍 ♥, then "Add a note" | **Fallback.** You see it without scrolling at both widths, it sits next to the other actions, and it adds one 48px row. The button row isn't changed. |
| B `11-option-B-beside-poster-*` | In the text column, under Director/Writers | On a phone it falls below a long overview (see Scream at 390), so you'd often have to scroll to rate. |
| C `12-option-C-your-take-section-*` | A new "Your take" section between the poster block and Where to Watch, with the note box always open | Adds a whole section and an empty text box to every card, including titles you haven't seen. That's the "poor use of space" the owner rejected. |

## Option A (fallback): build spec

### Card layout (`MovieDetailModal.tsx`, `TVShowDetailModal.tsx`)
Keep everything that's there today. Insert one block between the actions row (`div.flex.items-center.gap-2.mb-4`) and the poster + meta row:

```
<div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Seen it?</span>
  <DetailRating title={…} rating={entry?.rating} onRate={handleRate} />
  {noteState}
</div>
```

- **Rating:** reuse `components/detail/DetailRating.tsx` as it is (48px group, 44px buttons, `aria-pressed`, tap again to clear). Save it with `buildRateRequest` from `lib/detailRating.ts`, the way `MovieWatchlistAction` does: PATCH the entry if there is one, otherwise POST it as Watched. Use `"tv"` in the TV card.
- **Note, 3 states** (it's the existing `review` field: max 2000 characters, same API):
  1. **No note:** a text button, `Add a note` with a pencil icon, `h-11 px-1 text-sm font-medium text-accent-text`, on the same row as the rating (`10-…`). Tapping it opens state 2 and focuses the text box.
  2. **Editing** (`20-A-rated-note-editing-*`): a full-width `<textarea rows={3} maxLength={2000}>` on its own line inside the block (`w-full`): `rounded-control border border-border bg-bg text-text text-sm px-3 py-2`, with a focus ring `outline-focus`. Placeholder: "A note for yourself: what you thought, who recommended it…". Under it, a `text-xs text-muted` line: status on the left ("Saving…" / "Saved" / "Couldn't save. Retry"), and `n/2000` on the right. It saves on blur and when the card closes. Don't add a Save button.
  3. **Saved** (`21-A-rated-note-saved-*`): a full-width button, `rounded-control border border-border bg-surface-2 px-3 py-2 text-sm italic`, showing the note clamped to 2 lines (`line-clamp-2`), with `Edit` in `text-xs text-accent-text` on the right. Tapping it opens state 2. Emptying the text box and blurring clears the note and goes back to state 1.
- A note on a title that isn't on a list yet adds it as **Want to Watch** (POST with `review`). A rating adds it as Watched, as `buildRateRequest` already does.

### Button row
Keep the same three buttons, the same order and the same look. The only change is in behaviour: **"+ Add to Watchlist" no longer opens `AddMovieModal`/`AddTVModal`.** It adds the title as Want to Watch straight away and turns into "✓ On Your List" (optimistic, with an error toast if it fails). See open question 1 for what tapping "✓ On Your List" should do.

### "+" on a poster (`components/ui/PosterCard.tsx`)
`onAdd` opens the same card (`setDetailOpen(true)`) instead of the + menu. The pages that render `AddMovieModal`/`AddTVModal` (`what-to-watch`, `search`, `new-releases`, `watchlist`, `tv`, `tv/watching`, plus `MovieWatchlistAction`/`TVWatchlistAction` on the detail pages) stop using them. Delete the two modals only when nothing imports them any more.

### States
- **Loading:** the existing skeleton. Leave the "Seen it?" row out until the details and the list entry have loaded, so a rating doesn't flash in late.
- **Error loading details:** the existing `ErrorState`. No row.
- **Rating save fails:** `DetailRating` already rolls back and shows "Failed to save rating".
- **Long note:** 2 lines with an ellipsis in the saved state, and the text box can be resized while editing.
- **Signed out:** cards are only shown to signed-in users, so this case doesn't come up.
- **"More like this" swaps:** the row shows the entry for the title currently on screen (`watchlistEntries[currentId]`).

### Accessibility
- The rating group keeps `role="group"` with `aria-label="Your rating for {title}"`, and its buttons keep `aria-pressed` and 44px targets.
- The "Add a note" button is 44px tall. The textarea has `aria-label="Your note on {title}"`, and its status line uses `aria-live="polite"`.
- Contrast: `text-accent-text` (#c4b5fd) on `surface` passes AA. `text-muted` on `surface` is the existing label style.
- Light theme: every colour above is a token, so it follows the theme without extra work.

### Tokens and components used
`DetailRating`, `lib/detailRating.ts`, `text-muted`, `text-accent-text`, `bg-surface-2`, `border-border`, `bg-bg`, `rounded-control`, `outline-focus`. Nothing new.
