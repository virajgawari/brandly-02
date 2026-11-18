import { describe, expect, it } from "vitest";
import { cleanSocial, socialCount } from "@/lib/brand/socials";

describe("cleanSocial", () => {
  it("strips @ and URLs from handles", () => {
    expect(cleanSocial("instagram", "@juniper.bakery")).toBe("juniper.bakery");
    expect(cleanSocial("instagram", "https://www.instagram.com/juniper.bakery/?hl=en")).toBe("juniper.bakery");
    expect(cleanSocial("x", "https://x.com/junipercafe")).toBe("junipercafe");
  });
  it("rejects handles with bad characters", () => {
    expect(cleanSocial("instagram", "not a handle!")).toBe("");
  });
  it("adds https to links and drops the trailing slash", () => {
    expect(cleanSocial("website", "yourbrand.com")).toBe("https://yourbrand.com");
    expect(cleanSocial("facebook", "facebook.com/yourbrand/")).toBe("https://facebook.com/yourbrand");
  });
  it("returns empty for blank or unusable links", () => {
    expect(cleanSocial("website", "  ")).toBe("");
    expect(cleanSocial("linkedin", "nonsense")).toBe("");
  });
  it("counts filled fields", () => {
    expect(socialCount({ website: "https://a.com", instagram: "a" })).toBe(2);
  });
});
