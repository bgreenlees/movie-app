import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import WatchTogetherRedirect from "./page";

describe("/watch-together/[userId]", () => {
  it("redirects to What to Watch with that friend selected", async () => {
    await expect(WatchTogetherRedirect({ params: Promise.resolve({ userId: "abc123" }) })).rejects.toThrow(
      "NEXT_REDIRECT /what-to-watch?with=abc123"
    );
    expect(redirect).toHaveBeenCalledWith("/what-to-watch?with=abc123");
  });

  it("encodes the id", async () => {
    await expect(WatchTogetherRedirect({ params: Promise.resolve({ userId: "a b/c" }) })).rejects.toThrow(
      "with=a%20b%2Fc"
    );
  });
});
