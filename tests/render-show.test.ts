import { describe, expect, it } from "vitest";
import { applyShow, cleanShow } from "@/lib/render/show";

const post = { headline: "H", subline: "S", cta: "Buy" };

describe("applyShow", () => {
  it("keeps everything by default", () => {
    expect(applyShow(post, "logo")).toEqual({ post, logo: "logo" });
    expect(applyShow(post, "logo", {})).toEqual({ post, logo: "logo" });
  });
  it("drops only what is switched off", () => {
    const r = applyShow(post, "logo", { logo: false, cta: false });
    expect(r.logo).toBeUndefined();
    expect(r.post.cta).toBeUndefined();
    expect(r.post.subline).toBe("S");
    expect(r.post.headline).toBe("H");
  });
  it("hides the supporting line", () => {
    expect(applyShow(post, "logo", { subline: false }).post.subline).toBeUndefined();
  });
});

describe("cleanShow", () => {
  it("keeps booleans only", () => {
    expect(cleanShow({ logo: false, cta: "no", subline: true, x: 1 })).toEqual({ logo: false, subline: true });
    expect(cleanShow(null)).toBeUndefined();
    expect(cleanShow({})).toBeUndefined();
  });
});
