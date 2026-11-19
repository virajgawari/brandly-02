import { z } from "zod";
import type { BrandModel } from "@/lib/brand/model";
import { CONTENT_TEMPLATES } from "@/lib/templates";

const TEMPLATE_IDS = CONTENT_TEMPLATES.map((t) => t.id) as [string, ...string[]];

export const CAMPAIGN_RATIOS = ["4:5", "1:1", "9:16"] as const;
export type CampaignRatio = (typeof CAMPAIGN_RATIOS)[number];
export const CAMPAIGN_POSTS = 4;

export const CampaignPostSchema = z.object({
  title: z.string().min(3).max(80),
  pitch: z.string().min(5).max(200),
  template: z.enum(TEMPLATE_IDS),
});

/** The editable brief the user confirms before any post is written. */
export const CampaignBriefSchema = z.object({
  goal: z.string().min(3).max(140),
  offer: z.string().max(140).default(""),
  product: z.string().max(80).default(""),
  ratio: z.enum(CAMPAIGN_RATIOS).default("4:5"),
  posts: z.array(CampaignPostSchema).min(1).max(8),
});
export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;
export type CampaignPost = z.infer<typeof CampaignPostSchema>;

export const CAMPAIGN_PROMPT_VERSION = "campaign@2";

export const CAMPAIGN_SYSTEM = `You plan a short social media campaign for one brand from the owner's one-line request.
Reply with a brief: "goal" (what the campaign should achieve), "offer" (only if the request states one, else ""), "product" (the product or service it centres on, else ""), "ratio" (one of ${CAMPAIGN_RATIOS.join(", ")}; use "9:16" for stories or reels, else "4:5"), and exactly ${CAMPAIGN_POSTS} "posts".
The posts must differ in angle and template and build on each other (tease, reveal, proof, last call). Use only facts you are given; never invent prices, discounts, dates, events, people or customer quotes. Do not plan a post that needs a testimonial or a number you were not given.
"title" is 3 to 8 words, "pitch" is one plain sentence. "template" must be one of: ${TEMPLATE_IDS.join(", ")}.
Reply as {"goal":"","offer":"","product":"","ratio":"4:5","posts":[{"title":"","pitch":"","template":""}]}.`;

export function buildCampaignPrompt(model: BrandModel, request: string): string {
  const s = model.strategy;
  const lines = [
    `Brand: ${model.name}`,
    s.industry && `Industry: ${s.industry}`,
    s.offering && `Sells: ${s.offering}`,
    model.content?.pillars?.length && `Content pillars: ${model.content.pillars.join("; ")}`,
    `Request: ${request.trim().slice(0, 400)}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Dedupes posts by title, caps to the campaign size, trims strings. */
export function cleanCampaignBrief(b: CampaignBrief): CampaignBrief {
  const seen = new Set<string>();
  const posts = b.posts
    .map((p) => ({ ...p, title: p.title.trim(), pitch: p.pitch.trim() }))
    .filter((p) => {
      const k = p.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, CAMPAIGN_POSTS);
  return { ...b, goal: b.goal.trim(), offer: b.offer.trim(), product: b.product.trim(), posts };
}

/** The topic string handed to generate-post for one campaign post. */
export function campaignTopic(b: CampaignBrief, p: CampaignPost): string {
  const extra = [b.offer && `Offer: ${b.offer}`, b.product && `Product: ${b.product}`, `Campaign goal: ${b.goal}`].filter(Boolean).join(". ");
  return `${p.title}. ${p.pitch} ${extra}`.trim();
}

/** Typical LLM calls for a campaign, measured: 1 brief + about 5 per post (write, schema retry, judge, revise, re-judge). */
export function maxCampaignCalls(posts: number): number {
  return 1 + posts * 5;
}
