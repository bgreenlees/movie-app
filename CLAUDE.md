# What's Up Next (movie-app)

Movie/TV tracking app. Live at https://whatsupnext.site (Vercel project `movie-app`, scope `bobgreenlees-gmailcoms-projects`). See README.md for features and stack.

## Stack
Next.js 16 (App Router, Turbopack) · TypeScript · NextAuth v5 (Google + credentials) · Prisma 6 + Neon Postgres · Tailwind v4 · TanStack Query · TMDB API · Resend.

## Layout
- `app/(auth)` login/register · `app/(main)` signed-in pages · `app/api/*` route handlers
- `lib/` auth config, Prisma client (`db.ts`), TMDB client (`tmdb.ts`), search helpers
- `prisma/schema.prisma` — schema · `docs/specs/` — feature specs

## Commands
- `npm run dev` — dev server on http://localhost:3000 (uses the Neon `dev` branch)
- `npx tsc --noEmit` — type-check (run before every commit)
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`, Next core-web-vitals + TypeScript rules); must exit 0
- `npm test` — run the Vitest suite once (`npx vitest` for watch mode)
- `npm run build` — **runs `prisma migrate deploy` against `DATABASE_URL`; don't run locally**
- Prisma CLI reads `.env`, not `.env.local`. For `prisma generate` alone a placeholder works: `DATABASE_URL=postgresql://x@localhost/x npx prisma generate`

## Database
Neon project `movie-app` (`square-glade-69239353`) has two branches:
- `production` — used only by Vercel Production
- `dev` — full copy of production (real user data), used by Vercel Development + Preview and local dev

Safe to experiment against `dev`. Before any schema change or destructive script, check that `DATABASE_URL` points at the dev host (`ep-sparkling-resonance-…`), never production. To refresh `dev` from production: `neon branches reset dev --parent --project-id square-glade-69239353` (wipes dev changes).

Schema changes are applied with `prisma db push`; `prisma/migrations/*` is gitignored, so `migrate deploy` in the build is effectively a no-op.

## Env
`vercel env pull .env.local` fetches Development vars (dev database). `NEXTAUTH_URL` is production-only; locally NextAuth infers the host.

## Known issues
- No CI yet — tests only run when you run `npm test`.

## Testing
Vitest; test files sit next to the code as `*.test.ts` (e.g. `lib/fuzzySearch.test.ts`).
- Run `npm test` before every commit, alongside `npx tsc --noEmit`.
- Add tests when you change pure logic (search, scoring, date/region helpers) and when you fix a bug: write a test that fails first, then fix it, so the bug can't quietly come back.
- Tests must not touch the database or network. Pass fakes in (like `fuzzySearch`'s `search` argument) or use `vi.mock` for `lib/db.ts` / `lib/tmdb.ts`.

## Workflow
Branch per change → PR → merge to `main`. Merging to `main` deploys to production; every PR gets a Vercel preview URL.
