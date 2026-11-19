import { describe, expect, it } from "vitest";
import { MAX_VERSIONS, pushVersion, restoreVersion } from "@/lib/content/versions";
import { fixLayout } from "@/lib/render/fix-layout";
import type { GeneratedPost } from "@/lib/types";

const post = (headline: string): GeneratedPost => ({ caption: "c", hashtags: [], imagePrompt: "", cta: "", bestTimeToPost: "", postType: "Single image", platformVariants: {}, headline });

describe("versions", () => {
  it("keeps newest first and caps the history", () => {
    let p = post("0");
    for (let i = 1; i <= 8; i++) p = { ...post(String(i)), versions: pushVersion(p) };
    expect(p.versions).toHaveLength(MAX_VERSIONS);
    expect(p.versions![0].post.headline).toBe("7");
  });
  it("restoring keeps the current draft in history", () => {
    const base = { ...post("new"), versions: pushVersion(post("old")) };
    const back = restoreVersion(base, 0);
    expect(back.headline).toBe("old");
    expect(back.versions![0].post.headline).toBe("new");
    expect(back.versions).toHaveLength(1);
  });
  it("does not nest versions or the rendered image", () => {
    const v = pushVersion({ ...post("a"), versions: pushVersion(post("z")) });
    expect(v[0].post).not.toHaveProperty("versions");
  });
});

describe("fixLayout", () => {
  const allowed = ["photo-band", "quote", "split", "big-number"] as const;
  it("leaves a fine post alone", () => {
    const r = fixLayout({ layout: "quote", allowed: [...allowed], hasPhoto: false, headline: "Short", subline: "ok" });
    expect(r.changes).toEqual([]);
    expect(r.layout).toBe("quote");
  });
  it("swaps a photo layout when there is no photo", () => {
    const r = fixLayout({ layout: "photo-band", allowed: [...allowed], hasPhoto: false, headline: "Hi" });
    expect(r.layout).toBe("quote");
  });
  it("swaps big-number without a stat and trims long headlines", () => {
    const r = fixLayout({ layout: "big-number", allowed: [...allowed], hasPhoto: true, headline: "word ".repeat(30) });
    expect(r.layout).toBe("quote");
    expect(r.headline.length).toBeLessThanOrEqual(72);
    expect(r.headline.endsWith("…")).toBe(true);
  });
});
