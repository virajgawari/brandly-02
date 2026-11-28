import { describe, expect, it } from "vitest";
import { campaignTopic, CampaignBriefSchema, cleanCampaignBrief, maxCampaignCalls, CAMPAIGN_MAX } from "@/lib/content/campaign";

const post = (title: string) => ({ title, pitch: "A plain sentence about it.", template: "announcement" });

describe("campaign brief", () => {
  it("fills defaults for optional fields", () => {
    const b = CampaignBriefSchema.parse({ goal: "Launch the cold brew", posts: [post("Cold brew is here")] });
    expect(b.offer).toBe("");
    expect(b.ratio).toBe("4:5");
  });

  it("rejects a bad ratio or template", () => {
    expect(CampaignBriefSchema.safeParse({ goal: "Launch", ratio: "16:9", posts: [post("Cold brew")] }).success).toBe(false);
    expect(CampaignBriefSchema.safeParse({ goal: "Launch", posts: [{ ...post("Cold brew"), template: "nope" }] }).success).toBe(false);
  });

  it("dedupes titles and keeps the count the plan asked for (max 8)", () => {
    const b = CampaignBriefSchema.parse({
      goal: "Launch",
      posts: [post("One"), post("one"), post("Two"), post("Three"), post("Four"), post("Five")],
    });
    const c = cleanCampaignBrief(b);
    expect(c.posts.map((p) => p.title)).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(c.posts.length).toBeLessThanOrEqual(CAMPAIGN_MAX);
  });

  it("builds a topic carrying offer, product and goal", () => {
    const b = CampaignBriefSchema.parse({ goal: "Drive trials", offer: "Free tasting", product: "Cold brew", posts: [post("Cold brew is here")] });
    const t = campaignTopic(b, b.posts[0]);
    expect(t).toContain("Offer: Free tasting");
    expect(t).toContain("Product: Cold brew");
    expect(t).toContain("Campaign goal: Drive trials");
  });

  it("estimates LLM calls per campaign", () => {
    expect(maxCampaignCalls(4)).toBe(21);
  });
});
