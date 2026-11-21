# Spike: rent/buy prices per streaming store

Issue: #13 · Researched: 2026-11-21 · Status: **recommendation, no code**

## Question

The app already shows where a title can be watched, using TMDB watch providers
(`app/api/movies/[id]/providers/route.ts`, US only). TMDB says *which* stores
rent or sell a title but not the price. Can we show prices like "Rent $3.99 ·
Buy $14.99" next to each store, from a legal source, at hobby-project cost?

## TL;DR

**Go, with a small first version.** Use the **Streaming Availability API**
(Movie of the Night). It has:

- rent/buy prices with currency in 65 countries,
- a free tier that allows commercial use,
- explicit permission to cache the data for as long as we like,
- data refreshed daily.

The catch is the free tier's quota: 1,000 requests a month. We'd store prices
in Postgres and only fetch them when a user opens a title's detail page, so the
quota is spent on titles people actually look at. Rough effort is 1–2 days.

Before building, spend about 30 minutes with a free key to confirm two things
the public docs don't settle (see "Open questions"):

1. US rent/buy prices really come back for Apple TV, Amazon, Google Play and
   Fandango at Home.
2. The exact attribution wording we have to show.

If that check fails, it's a **no-go for now**. The remaining options are either
sales-gated (JustWatch, Reelgood, International Showtimes), $349/month for
commercial use (Watchmode), or cover a single store and are hard to match to our
titles (Apple). That's not worth it for one line of UI.

## Comparison

All sources were accessed on 2026-11-21. "SA API" = Streaming Availability API.

| Source | Prices? | Stores / countries | Freshness | Cost at hobby scale | Caching & attribution | Access / API quality |
|---|---|---|---|---|---|---|
| **SA API (Movie of the Night)** | Yes. Rent/buy options carry amount, ISO 4217 currency and a ready-to-show formatted string. There's one option per video quality. | 65 countries, about 2,349 catalogs. US rent/buy store list **not yet verified**. | "Most of the data is updated daily" | **Free: 1,000 req/mo**, then $49 (25k), $99 (100k), $299 (1M). Hard cap with no overage charges. | Cache "as long as you need". Commercial use OK on every plan, free included. Attribution required when data is shown publicly. | Self-serve key. REST + JSON, keyed by TMDB/IMDb ID, with an official TS client. Good docs. |
| **Watchmode** | Yes. `price` number on rent/buy sources, but **no currency field** in the spec, and the example shows `price: null`. | 436 services, 54 countries. Free plan limited to 3 countries. | "Catalog data refreshes daily" | Free 2,500 credits/mo is **non-commercial only**. Commercial starts at **$349/mo**. | Free: cache ≤ 30 days, must credit and link Watchmode. Paid: cache while subscribed, no attribution. No resale. | Self-serve. Good REST API with OpenAPI spec, accepts TMDB IDs (+1 credit). |
| **JustWatch Partner API** | Yes. `retail_price` + `currency` per offer, `monetization_type` buy/rent. | Widest coverage (it's the data behind TMDB providers). | Daily data export; API is live. | Not published. **Contract only**, via a sales form / data-partner@justwatch.com. | Branded "JustWatch" link required next to every integration. Scraping and the unofficial GraphQL API are not sanctioned. | Good API, but not realistically available to a hobby app. |
| **Apple iTunes Search/Lookup API** | Yes, Apple only: `trackPrice`, `trackRentalPrice`, `trackHdPrice`, `trackHdRentalPrice`, `currency`. Verified live with `lookup?id=400763833` (Inception): US $7.99 buy / $4.99 rent. Also returns GBP and CAD; no result for `country=de`. | **One store** (Apple TV/iTunes), per-country storefronts. | Live (forum reports of stale cached prices). | Free, about 20 calls/min. | Caching encouraged ("Large websites should set up caching logic"). Promo assets must link to the store. | **Title search for movies is unreliable.** `search?term=inception&entity=movie` returned 0 results on 2026-11-21. Matching TMDB IDs to iTunes IDs is the hard part. |
| **Amazon Creators API** (replaced PA-API 5, which now returns 403) | Physical-product `OffersV2` prices. **No documented Prime Video rent/buy prices.** | Amazon only. | Live. | Free, but only for Associates accounts **with qualifying sales**. Access lost after 30 days with no sales. | Prices may be cached **≤ 24 h**, with a timestamp if refreshed less often than hourly. Sites "must not have price tracking and/or price alerting functionality". | Not a fit. |
| **Reelgood for Business** | "Rent/Buy Prices" listed in the data dictionary. | 300+ services, about 15–25 countries. | "Refreshed every few minutes" | Not published. Sales form only. | Terms not readable (403). | Enterprise-oriented. |
| **International Showtimes Streaming API** | Yes. `offer_type`, `price`, `currency` per offer. | Europe + English-speaking markets. | Not stated. | "Pricing isn't listed on the website". Trial key on request. | Not published. | Sales-gated. |

### Notes per source

**Streaming Availability API.** This is the only option that is self-serve, has
multi-store prices, and allows commercial use on a free plan. Its show object has
`streamingOptions` keyed by country code, with option types `subscription | free
| rent | buy | addon`. For rent/buy, "a numerical amount and an ISO 4217 currency
code are provided, as well as a formatted price string ready to be displayed".
Quotas are a hard limit: when they run out, the API is blocked until the next
billing cycle and nothing is charged. I couldn't render the full
terms-and-conditions page (it's JavaScript-only), so the exact attribution
wording is unconfirmed.

**Watchmode.** This is technically the closest competitor, but its free plan
forbids commercial use ("Can I use the free plan in a commercial app? No."). The
first commercial plan costs $349/mo. The terms were last updated 2026-10-24.
`price` has no documented currency, so non-US display would need care.

**JustWatch.** JustWatch's partner API does expose prices, but access needs a
signed contract and a partner token. Nothing suggests a hobby tier exists.
Scraping justwatch.com or calling its private GraphQL API would be the
"workaround" path. That isn't sanctioned, can break without notice, and is the
kind of thing that gets an app blocked. Not recommended.

Side note: TMDB's watch-provider data is itself powered by JustWatch, and TMDB
asks apps to credit JustWatch when they show it. We should check that we already
do (see follow-ups).

**Apple.** Apple is free and has accurate prices, but covers only one store.
Matching is the blocker. Movie *search* returned nothing for well-known titles
during this spike, though *lookup by iTunes ID* worked. We have no reliable
TMDB→iTunes ID mapping. Apple could be a free supplement later. On its own it
can't produce "prices per store".

**Amazon.** PA-API 5 is retired and the Creators API replaces it. Access depends
on ongoing affiliate sales, digital video rent/buy prices aren't documented, and
the policies ban price tracking or alerts. Not viable.

## Recommendation: go with the Streaming Availability API

### Why this one

- It's the only legal, self-serve source with prices for several stores.
- The free tier allows commercial use, so we pay nothing until usage grows. The
  next tier is $49/mo, not $349.
- Caching is explicitly allowed, which lets us live within 1,000 requests a
  month.
- It's keyed by TMDB ID, which we already have, so there's no title matching.

### Integration sketch

```
Title page  ──GET /api/movies/[id]/prices──▶  route handler
                                               │
                         ┌─────────────────────┴───────────┐
                         │ Prisma: TitlePrice cache row     │
                         │ fresh (< 3 days)? → return it    │
                         └─────────────┬───────────────────┘
                                       │ stale / missing
                                       ▼
                     lib/streamingAvailability.ts
                     GET /shows/movie/{tmdbId}?country=us
                     → keep rent/buy options only
                     → upsert cache row, return
```

1. **Client:** add `lib/streamingAvailability.ts`, a thin fetch wrapper (or the
   official TS client) with `STREAMING_AVAILABILITY_API_KEY` in Vercel env
   (Development, Preview and Production).
2. **Cache:** add a Prisma model, e.g. `TitlePrice { tmdbId, mediaType,
   country, data Json, fetchedAt }`, unique on `(tmdbId, mediaType, country)`.
   Apply it with `prisma db push` on the **dev** branch first, per CLAUDE.md.
   Prices change rarely, so a 3–7 day TTL is fine.
3. **Route:** add `app/api/movies/[id]/prices` (kept separate from
   `providers`, so a price failure never breaks the existing "where to watch"
   list). It returns `[{ service, type: "rent"|"buy", quality, formatted,
   amount, currency, link }]`. On a 429 or quota error it serves stale cache, or
   an empty list.
4. **UI:** on the title page, show the price next to the matching TMDB
   provider logo (map SA service IDs to TMDB provider IDs; a small hand-written
   table covers the 5–6 US stores). Add the required attribution line and a
   "prices as of {date}" note.
5. **Tests (Vitest, no network):** cover the pure parts with
   `lib/streamingAvailability.ts` mocked: response → price list mapping,
   cheapest-per-store/quality selection, cache freshness check and the
   service-ID mapping.
6. **Quota guard:** only fetch on detail-page views, never in lists or search.
   Log the remaining quota (the response headers report it) so we notice
   before it runs out.

**Effort:** about 1–2 days including tests. Add roughly half a day if we also do
countries other than the US. The API supports them; the existing providers
route is US-only today, so both would need a country setting.

**Running cost:** $0 while we stay under 1,000 cache misses a month (about 33 a
day). If we outgrow that, Starter costs $49/mo for 25k requests.

## Open questions (verify before building)

1. With a free key, call `GET /shows/movie/{tmdbId}?country=us` for 3–4 recent
   and older titles. Do rent/buy prices come back for Apple TV, Prime Video,
   Google Play and Fandango at Home? What's the exact price JSON shape?
2. Read https://developers.movieofthenight.com/terms-and-conditions#attribution
   in a browser and record the exact attribution requirement.
3. Does the price differ between SD/HD/4K options, and which one do we show?
   Suggestion: the cheapest, labelled with its quality.

## Sources (all accessed 2026-11-21)

- Streaming Availability API: docs https://docs.movieofthenight.com/ ·
  show resource https://docs.movieofthenight.com/resource/shows · countries
  https://docs.movieofthenight.com/guide/countries-and-services · product page
  https://www.movieofthenight.com/about/api · pricing & FAQ (plans, caching,
  commercial use, freshness) https://www.movieofthenight.com/about/api/pricing ·
  terms (JS-rendered, not read) https://developers.movieofthenight.com/terms-and-conditions
- Watchmode: home/pricing https://api.watchmode.com/ ·
  https://api.watchmode.com/pricing · OpenAPI spec
  https://api.watchmode.com/openapi.json · terms (last updated 2026-10-24)
  https://api.watchmode.com/tc
- JustWatch: partner API docs https://apis.justwatch.com/docs/api/ · OpenAPI
  https://apis.justwatch.com/docs/static/jw-partner-api.yaml · widget docs
  https://apis.justwatch.com/docs/widget/ · widget terms
  https://apis.justwatch.com/docs/widget/terms_and_conditions/ · sales page
  https://www.justwatch.com/us/JustWatch-Streaming-API ·
  partner dashboard terms https://partners.justwatch.com/legal/termsofuse
- Apple: Search API docs https://performance-partners.apple.com/search-api ·
  live test `https://itunes.apple.com/lookup?id=400763833&country=us` (run
  2026-11-21) · rate-limit and stale-price forum threads
  https://developer.apple.com/forums/thread/66399 ,
  https://developer.apple.com/forums/thread/67484
- Amazon: PA-API 5 deprecation
  https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation ·
  migration guide
  https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi ·
  Associates Program Policies (updated 2026-04-14)
  https://affiliate-program.amazon.com/help/operating/policies
- Reelgood: data dictionary https://data.reelgood.com/api-docs/data-dictionary ·
  partner API https://data.reelgood.com/products/reelgood-partner-api
- International Showtimes: https://www.internationalshowtimes.com/streaming-api
