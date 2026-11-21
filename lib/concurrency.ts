/**
 * Run at most `limit` async tasks at a time. Wrap each task in the returned
 * function; extra calls wait in a queue. Used to keep one request's TMDB detail
 * lookups from all firing at once (TMDB rate-limits per IP, and Vercel functions
 * share egress IPs).
 */
export function createLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    queue.shift()?.();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        // Promise.resolve().then so a task that throws synchronously still frees its slot
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(next);
      };
      if (active < limit) start();
      else queue.push(start);
    });
  };
}
