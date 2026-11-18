import { z } from "zod";
import type { BrandModel } from "@/lib/brand/model";
import { CONTENT_TEMPLATES } from "@/lib/templates";

const TEMPLATE_IDS = CONTENT_TEMPLATES.map((t) => t.id) as [string, ...string[]];

export const IdeaSchema = z.object({
  title: z.string().min(3).max(80),
  pitch: z.string().min(5).max(200),
  template: z.enum(TEMPLATE_IDS),
});
export const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(1).max(8) });
export type PostIdea = z.infer<typeof IdeaSchema>;

export const IDEAS_PROMPT_VERSION = "ideas@1";
export const IDEA_COUNT = 4;

export const IDEAS_SYSTEM = `You suggest social media post ideas for one brand. Each idea is a specific post the owner could publish this week, not a generic theme.
Give ${IDEA_COUNT} ideas that differ from each other in angle and template. Use only the facts you are given; never invent prices, offers or events.
"title" is 3 to 8 words. "pitch" is one plain sentence on what the post says and why it fits this audience.
"template" must be one of: ${TEMPLATE_IDS.join(", ")}.
Reply as {"ideas":[{"title":"","pitch":"","template":""}]}.`;

function audienceLine(model: BrandModel): string {
  const a = model.strategy.audience;
  if (!a) return "";
  return [a.gender && a.gender !== "all" ? a.gender : "", a.ageGroups?.join(", "), a.markets?.countries?.join(", "), a.motivations?.join(", ")].filter(Boolean).join("; ");
}

/** The user message: what the brand sells, who for, its pillars, and recent posts to avoid repeating. */
export function buildIdeasPrompt(model: BrandModel, recentOpenings: string[] = []): string {
  const s = model.strategy;
  const lines = [
    `Brand: ${model.name}`,
    s.industry && `Industry: ${s.industry}`,
    s.offering && `Sells: ${s.offering}`,
    audienceLine(model) && `Audience: ${audienceLine(model)}`,
    model.content?.pillars?.length && `Content pillars: ${model.content.pillars.join("; ")}`,
    s.differentiators?.length && `What sets it apart: ${s.differentiators.slice(0, 3).join("; ")}`,
  ].filter(Boolean);
  if (recentOpenings.length) {
    lines.push(`Recent posts (do not repeat these angles):\n${recentOpenings.slice(0, 10).map((o, i) => `${i + 1}. ${o}`).join("\n")}`);
  }
  return lines.join("\n");
}

/** Drops duplicates by title and caps the list. */
export function cleanIdeas(ideas: PostIdea[]): PostIdea[] {
  const seen = new Set<string>();
  return ideas
    .filter((i) => {
      const k = i.title.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, IDEA_COUNT);
}
