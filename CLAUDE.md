# What's Up Next (movie-app)

Movie/TV tracking app. Live at https://whatsupnext.site (Vercel project `movie-app`, scope `bobgreenlees-gmailcoms-projects`). See README.md for features and stack.

## Stack
Next.js 16 (App Router, Turbopack) · TypeScript · NextAuth v5 (Google + credentials) · Prisma 6 + Neon Postgres · Tailwind v4 · TanStack Query · TMDB API · Resend.

## Layout
- `app/(auth)` login/register · `app/(main)` signed-in pages · `app/api/*` route handlers
- `lib/` auth config, Prisma client (`db.ts`), TMDB client (`tmdb.ts`), search helpers
- `prisma/schema.prisma` — schema · `docs/specs/` — feature specs

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npx tsc --noEmit` — type-check (run before every commit)
- `npm run build` — **runs `prisma migrate deploy` against `DATABASE_URL`; don't run locally**
- Prisma CLI reads `.env`, not `.env.local`. For `prisma generate` alone a placeholder works: `DATABASE_URL=postgresql://x@localhost/x npx prisma generate`

## ⚠️ Database
`DATABASE_URL` is one Vercel variable shared by Production, Preview and Development, so **local dev and preview deploys use the production database**. Never run `prisma db push`, `migrate`, or destructive scripts locally without explicit confirmation. (Planned: separate Neon dev branch.)

Schema changes are applied with `prisma db push`; `prisma/migrations/*` is gitignored, so `migrate deploy` in the build is effectively a no-op.

## Env
`vercel env pull .env.local` fetches dev vars. `NEXTAUTH_URL` is production-only; locally NextAuth infers the host.

## Known issues
- `npm run lint` is broken: `next lint` was removed in Next 16 and `.eslintrc.json` is the legacy format ESLint 9 ignores. Needs migration to `eslint.config.mjs`.
- No tests or CI yet.

## Workflow
Branch per change → PR → merge to `main`. Merging to `main` deploys to production; every PR gets a Vercel preview URL.
