# What's Up Next

A movie and TV show tracking app built with Next.js. Discover new releases, track what you're watching, keep watchlists, and get personalized recommendations powered by TMDB.

## Features

- **Movies & TV tracking** — watchlists, watched history, and "currently watching" status with season/episode progress
- **Discover pages** — recommended and new-release movies and TV shows via TMDB
- **News** — recent movie/TV news via RSS
- **Watch Together** — connect with other users and compare watchlists
- **Onboarding flow** — seed initial preferences for better recommendations
- **Auth** — Google OAuth via NextAuth, with email/password fallback
- **Feedback form** — in-app feature requests emailed via Resend

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Auth**: NextAuth v5 (Google OAuth + credentials)
- **Database**: Prisma ORM + PostgreSQL (Neon)
- **Styling**: Tailwind CSS v4
- **Data**: [TMDB API](https://www.themoviedb.org/documentation/api)
- **Email**: Resend
- **Data fetching**: TanStack Query

## Getting started

### Prerequisites

- **Node.js 24** (the version in `.nvmrc`, same as Vercel and CI). With a version manager: `fnm use` or `nvm use`.
- The [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`), logged in with access to the `movie-app` project. It provides the dev environment variables.

You don't need your own database or API keys: local development uses the shared Neon **dev** branch and the Development variables stored in Vercel.

### Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Pull the Development environment variables into `.env.local`. They point at the Neon `dev` branch, never production:

   ```bash
   vercel env pull .env.local --environment=development --project movie-app --scope bobgreenlees-gmailcoms-projects --yes
   ```

   `.env.example` lists every variable the app reads and what it's for. Don't set `NEXTAUTH_URL` locally; NextAuth works out the host itself.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   The app runs at [http://localhost:3000](http://localhost:3000).

The dev database already has the current schema, so there's no database step. Schema changes are a separate, deliberate step; see "Database" in `CLAUDE.md`.

### Other commands

```bash
npx tsc --noEmit   # type-check
npm run lint       # ESLint
npm test           # Vitest, run once (npx vitest for watch mode)
npm run start      # start a production build locally
```

Run the type-check, lint and tests before every commit. CI runs the same three on every pull request.

Don't run `npm run build` locally: it runs `prisma migrate deploy` against whatever `DATABASE_URL` is set. Vercel builds with its own build command (`npx prisma generate && next build`, set in the Vercel project settings).

## Project structure

```
app/
  (auth)/       # login, register
  (main)/       # authenticated app routes (search, tv, watchlist, watched, etc.)
  api/          # API routes (movies, tv, watchlist, auth, feedback, ...)
components/     # shared UI, movie, and TV components
lib/            # auth config, db client, TMDB client
prisma/         # schema.prisma (migrations are not committed)
docs/           # feature specs and reviews
```

## Deployment

Deployed on [Vercel](https://vercel.com) with a [Neon](https://neon.tech) Postgres database. Live at https://whatsupnext.site.

- Every pull request gets a Vercel preview deployment, using the Neon `dev` branch.
- Merging to `main` deploys to production, using the Neon `production` branch. `main` is protected: the `ci` check (type-check, lint, tests) must pass first.
