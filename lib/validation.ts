// Small hand-written input guards for write endpoints (no dependency).
// Each guard returns `{ ok: true, value }` or `{ ok: false, error }`, where the
// error names the offending field so routes can answer `400 { error }`.

export type Valid<T> = { ok: true; value: T };
export type Invalid = { ok: false; error: string };
export type Result<T> = Valid<T> | Invalid;

export const MAX_REVIEW_LENGTH = 2000;
export const MAX_SHORT_TEXT_LENGTH = 50;
export const MAX_PROGRESS = 500;
export const MAX_STREAMING_SERVICES = 50;

const ok = <T>(value: T): Valid<T> => ({ ok: true, value });
const fail = (error: string): Invalid => ({ ok: false, error });

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

/** Positive integer id (e.g. a TMDB movie/show id). Required. */
export function parseId(v: unknown, field: string): Result<number> {
  return isInt(v) && v > 0 ? ok(v) : fail(`${field} must be a positive integer`);
}

/** Integer 1–5, or null when cleared / absent. */
export function parseRating(v: unknown): Result<number | null> {
  if (v === null || v === undefined) return ok(null);
  return isInt(v) && v >= 1 && v <= 5 ? ok(v) : fail("rating must be an integer between 1 and 5");
}

function parseText(v: unknown, field: string, max: number): Result<string | null> {
  if (v === null || v === undefined || v === "") return ok(null);
  if (typeof v !== "string") return fail(`${field} must be a string`);
  return v.length <= max ? ok(v) : fail(`${field} must be at most ${max} characters`);
}

export const parseReview = (v: unknown) => parseText(v, "review", MAX_REVIEW_LENGTH);
export const parsePlatform = (v: unknown) => parseText(v, "platform", MAX_SHORT_TEXT_LENGTH);
export const parseWatchType = (v: unknown) => parseText(v, "watchType", MAX_SHORT_TEXT_LENGTH);

/** Season / episode: integer 0–500, or null when cleared / absent. */
export function parseProgress(v: unknown, field: string): Result<number | null> {
  if (v === null || v === undefined) return ok(null);
  return isInt(v) && v >= 0 && v <= MAX_PROGRESS
    ? ok(v)
    : fail(`${field} must be an integer between 0 and ${MAX_PROGRESS}`);
}

/** One of the given enum values (pass `Object.values(WatchStatus)`). */
export function parseEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): Result<T> {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? ok(v as T)
    : fail(`${field} must be one of: ${allowed.join(", ")}`);
}

/** Array of at most 50 positive integers. */
export function parseStreamingServices(v: unknown): Result<number[]> {
  if (!Array.isArray(v)) return fail("streamingServices must be an array");
  if (v.length > MAX_STREAMING_SERVICES) {
    return fail(`streamingServices must have at most ${MAX_STREAMING_SERVICES} items`);
  }
  if (!v.every((x) => isInt(x) && x > 0)) return fail("streamingServices must contain only positive integers");
  return ok(v as number[]);
}

/**
 * Runs the checks in order and returns the first failure, so routes can write
 * `const bad = firstError(a, b); if (bad) return 400`.
 */
export function firstError(...results: Result<unknown>[]): string | null {
  for (const r of results) if (!r.ok) return r.error;
  return null;
}

/** Parses a JSON body that must be an object; anything else is a 400. */
export async function readJsonObject(req: Request): Promise<Result<Record<string, unknown>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("Request body must be a JSON object");
  }
  return ok(body as Record<string, unknown>);
}
