import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyModel } from "@/lib/brand/model";
import { EMPTY_HISTORY } from "@/lib/content/history";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/session", () => ({ optionalSession: async () => null }));
vi.mock("@/lib/db/llm-scope", () => ({ llmScope: async (_f: string, _o: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/llm-log", () => ({ lastLlmCallId: () => "gen-1" }));
vi.mock("@/lib/content/history", async (orig) => ({ ...(await orig<typeof import("@/lib/content/history")>()), recentPosts: async () => EMPTY_HISTORY }));
vi.mock("@/lib/n8n", () => ({ n8nEnabled: () => false, n8nRequest: vi.fn() }));
const gen = vi.fn();
vi.mock("@/lib/llm", () => ({ generateStructured: (...a: unknown[]) => gen(...a) }));

import { generatePost, REVISE_DEADLINE_MS } from "@/lib/content/generate";

const model = emptyModel("Test", "build");
const post = (caption: string) => ({
  caption,
  hashtags: ["#a", "#b", "#c", "#d", "#e"],
  cta: "Visit us",
  headline: "Slow pour",
  subline: "",
  bestTimeToPost: "",
  postType: "Single image",
  platformVariants: {},
});
const good = "Cold brew poured slow at six every morning";
const ratings = (score: number) => ({
  ratings: [{ id: 1, sincerity: { score, quote: "Cold brew" }, excitement: { score, quote: "poured slow" }, competence: { score, quote: "every morning" } }],
});

/** Judge returns `scores` in order; writer returns `posts` in order. */
function script(posts: string[], scores: number[]) {
  let w = 0;
  let j = 0;
  gen.mockImplementation(async (_s: unknown, _sys: string, _user: string, opts: { task: string }) =>
    opts.task === "judge" ? ratings(scores[j++]) : post(posts[w++])
  );
}
const run = () => generatePost({ model, platforms: ["instagram"], feature: "generate-post" });
const writes = () => gen.mock.calls.filter((c) => c[3].task !== "judge");

beforeEach(() => {
  gen.mockReset();
  vi.useRealTimers();
});

describe("generatePost judge loop", () => {
  it("makes no revise call when the post passes", async () => {
    script([good], [50]);
    const r = await run();
    expect(writes()).toHaveLength(1);
    expect("post" in r && r.post.check?.revised).toBe(false);
    expect("post" in r && r.post.check?.fit.passed).toBe(true);
  });

  it("revises once with the failures in the prompt, and keeps the better post", async () => {
    script([good, "Cold brew, poured slow at six every morning."], [95, 52]);
    const r = await run();
    expect(writes()).toHaveLength(2);
    expect(writes()[1][2]).toContain("sincerity: post scores 95, the brand is 50");
    expect("post" in r && r.post.check?.revised).toBe(true);
    expect("post" in r && r.post.caption).toContain("poured slow at six every morning.");
  });

  it("keeps the original when the revision is worse", async () => {
    script([good, "Cold brew poured slow at six every morning!"], [80, 99]);
    const r = await run();
    expect("post" in r && r.post.caption).toBe(good);
    expect("post" in r && r.post.check?.revised).toBe(true);
  });

  it("skips the revise past the deadline", async () => {
    vi.useFakeTimers();
    script([good, good], [95]);
    gen.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + REVISE_DEADLINE_MS + 1000);
      return post(good);
    });
    const r = await run();
    expect(writes()).toHaveLength(1);
    expect("post" in r && r.post.check?.revised).toBe(false);
  });

  it("returns the post without a check when the judge fails", async () => {
    gen.mockImplementation(async (_s: unknown, _sys: string, _u: string, opts: { task: string }) => {
      if (opts.task === "judge") throw new Error("429");
      return post(good);
    });
    const r = await run();
    expect("post" in r && r.post.check?.fit.status).toBe("skipped");
    expect(writes()).toHaveLength(1);
  });
});
