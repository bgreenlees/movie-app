import { describe, expect, it } from "vitest";
import { createLimiter } from "./concurrency";

describe("createLimiter", () => {
  it("never runs more than the limit at once, and runs every task", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const task = (i: number) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1 + (i % 3)));
      active--;
      return i;
    };
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => limit(task(i))));
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(peak).toBe(3);
  });

  it("frees the slot when a task fails or throws synchronously", async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(
      limit(() => {
        throw new Error("sync");
      })
    ).rejects.toThrow("sync");
    await expect(limit(async () => "still runs")).resolves.toBe("still runs");
  });

  it("rejects a non-positive limit", () => {
    expect(() => createLimiter(0)).toThrow();
  });
});
