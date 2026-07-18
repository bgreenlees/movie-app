# claude-movie-app

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

- Node.js
- A PostgreSQL database (e.g. [Neon](https://neon.tech))
- A [TMDB API key](https://www.themoviedb.org/settings/api)
- Google OAuth credentials
- A [Resend](https://resend.com) API key (for the feedback form)

### Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file with the following variables:

   ```bash
   DATABASE_URL=
   AUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   TMDB_API_KEY=
   TMDB_API_BASE_URL=
   RESEND_API_KEY=
   ```

3. Push the Prisma schema to your database:

   ```bash
   npx prisma db push
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

   The app runs at [http://localhost:3000](http://localhost:3000).

### Other commands

```bash
npm run build   # prisma generate + migrate deploy + next build
npm run start   # start production server
npm run lint    # run ESLint
```

## Project structure

```
app/
  (auth)/       # login, register
  (main)/       # authenticated app routes (search, tv, watchlist, watched, etc.)
  api/          # API routes (movies, tv, watchlist, auth, feedback, ...)
components/     # shared UI, movie, and TV components
lib/            # auth config, db client, TMDB client
prisma/         # schema and migrations
```

## Deployment

Deployed on [Vercel](https://vercel.com) with a [Neon](https://neon.tech) Postgres database.
