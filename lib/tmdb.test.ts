import { describe, expect, it, vi } from "vitest";
// "server-only" throws outside a React Server Components build; Vitest is neither.
vi.mock("server-only", () => ({}));
import { tvEpisodeRuntime } from "./tmdb";

describe("tvEpisodeRuntime", () => {
  it("uses episode_run_time when TMDB has it", () => {
    expect(tvEpisodeRuntime({ episode_run_time: [22, 30], last_episode_to_air: { runtime: 45 } })).toBe(22);
  });

  it("falls back to the latest episode's runtime when episode_run_time is empty", () => {
    expect(tvEpisodeRuntime({ episode_run_time: [], last_episode_to_air: { runtime: 23 } })).toBe(23);
    expect(tvEpisodeRuntime({ episode_run_time: [0], last_episode_to_air: { runtime: 23 } })).toBe(23);
  });

  it("is null when neither is known", () => {
    expect(tvEpisodeRuntime({ episode_run_time: [], last_episode_to_air: null })).toBeNull();
    expect(tvEpisodeRuntime({})).toBeNull();
    expect(tvEpisodeRuntime({ last_episode_to_air: { runtime: null } })).toBeNull();
  });
});
