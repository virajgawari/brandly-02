import { describe, expect, it } from "vitest";
import { checkRules } from "@/lib/judge/rules";

const limits = { instagram: { caption: 2200 }, twitter: { caption: 280 } };
const good = { caption: "Cold brew, poured slow at six.", hashtags: ["#a", "#b", "#c", "#d", "#e"], cta: "Visit us", headline: "Slow pour" };
const opts = { banned: ["elevate", "unlock"], platforms: ["instagram"], limits };

describe("checkRules", () => {
  it("passes a clean post", () => {
    expect(checkRules(good, opts)).toEqual({ passed: true, failures: [] });
  });
  it("fails on a banned word", () => {
    const r = checkRules({ ...good, caption: "Elevate your mornings." }, opts);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("banned: elevate");
  });
  it("fails over the platform limit", () => {
    const r = checkRules({ ...good, caption: "x".repeat(300) }, { ...opts, platforms: ["twitter"] });
    expect(r.failures.some((f) => f.includes("over limit"))).toBe(true);
  });
  it("fails on hashtag count", () => {
    expect(checkRules({ ...good, hashtags: ["#a"] }, opts).failures).toContain("hashtags: 1");
  });
});
