import { analyseImages, generateStructured, parseJSON } from "../../llm";
import { PlaybookSchema, StyleGuideSchema } from "../schemas";
import type { Playbook, StyleGuide } from "../model";
import type { ScoredPost } from "../../social/types";
import type { StageDefinition } from "./types";
import { FORMATS } from "../../content/brief";

export interface SocialInput {
  /** Cleaned, scored posts from `triage`, best first. */
  socialPosts?: ScoredPost[];
  /** Base64 JPEGs of the top posts' images (10-15). */
  socialImages?: string[];
}

const MAX_CAPTION_CHARS = 600;
const ANCHORS = 5;

export const STYLE_PROMPT = `Analyse these social media post images from the same brand. Act as a Senior Art Director and reverse-engineer their visual identity into a strict Visual Style Guide.
Return JSON only:
{
  "medium": "medium and photography style (e.g. harsh direct flash, soft sunlit lifestyle, 3D renders, flat vector)",
  "palette": "dominant, secondary and accent colours with approximate hex codes, plus colour grading and contrast",
  "composition": "where the subject sits, use of negative space for text, camera angles, aspect ratios",
  "typography": "font categories, alignment, box or pill backgrounds, logo placement. Empty string if no text appears",
  "textOnImagePct": 0,  // 0-100: share of these images with text or graphics laid over the photo
  "promptSuffix": "about 40 words describing lighting, camera or medium, colour mood and aesthetic, to append to every image prompt. Do NOT mention any specific subject."
}`;

/** Compact text of the posts for the copy call: caption, metrics, no raw JSON. */
export function postsForPrompt(posts: ScoredPost[]): string {
  return posts
    .map((p, i) => {
      const caption = p.caption.length > MAX_CAPTION_CHARS ? `${p.caption.slice(0, MAX_CAPTION_CHARS)}...` : p.caption;
      return `#${i + 1}${p.isTop ? " [TOP]" : ""} ${p.type} | likes ${p.likes} comments ${p.comments}${p.views ? ` views ${p.views}` : ""}\n${caption}`;
    })
    .join("\n---\n");
}

export function playbookPrompt(brand: string, posts: ScoredPost[]): string {
  return `Analyse these ${posts.length} posts from ${brand}, paying special attention to the ones marked [TOP], which performed best. Create a Brand Voice & Copywriting Playbook.

${postsForPrompt(posts)}

Return JSON only:
{
  "pillars": [{"name": "content pillar", "pct": 40}],   // categorise the posts; percentages add up to 100
  "adjectives": ["5 specific adjectives for how they sound"],
  "neverSoundsLike": "what they NEVER sound like",
  "hookFormulas": ["4-5 exact patterns in the first line, before 'read more'"],
  "formatting": {"avgWords": 0, "lineBreaks": "sentence length, line-break spacing, bullet style", "emoji": "how many per post, which ones, where"},
  "cta": "how posts close",
  "hashtagRule": "exact hashtag count and placement",
  "blacklist": ["marketing cliches they never use"],
  "formatMix": [{"format": "one id from: ${FORMATS.filter((f) => !f.manual).map((f) => f.id).join(", ")}", "pct": 30}]   // which of these formats the posts follow, closest match each; percentages add up to 100
}`;
}

/** Share of the feed by post type, from the scraped posts themselves. Video-like and text-only posts count as video / image. */
export function postTypeMix(posts: ScoredPost[]): { image: number; carousel: number; video: number } {
  const n = posts.length || 1;
  const share = (f: (p: ScoredPost) => boolean) => Math.round((posts.filter(f).length / n) * 100);
  return { image: share((p) => p.type === "image" || p.type === "text"), carousel: share((p) => p.type === "carousel"), video: share((p) => p.type === "video") };
}

/** Keeps only known format ids, merges duplicates and rescales to 100. */
export function cleanFormatMix(mix: { format: string; pct: number }[]): { format: string; pct: number }[] {
  const ids = new Set(FORMATS.filter((f) => !f.manual).map((f) => f.id));
  const sums = new Map<string, number>();
  for (const m of mix) if (ids.has(m.format) && m.pct > 0) sums.set(m.format, (sums.get(m.format) ?? 0) + m.pct);
  const total = Array.from(sums.values()).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Array.from(sums, ([format, v]) => ({ format, pct: Math.round((v / total) * 100) })).sort((a, b) => b.pct - a.pct);
}

/** Reads the brand's real top posts into a visual style guide and a voice playbook. */
export const socialStage: StageDefinition<SocialInput> = {
  id: "social",
  label: "Learning from your real posts",
  reads: ["voice", "expression"],
  writes: ["voice", "expression"],
  async run(model, input, { report }) {
    const posts = input.socialPosts ?? [];
    if (posts.length < 3) {
      report({ id: "social", label: "Not enough posts to learn from", status: "info" });
      return { patches: [] };
    }
    const patches: Awaited<ReturnType<typeof socialStage.run>>["patches"] = [];
    const opts = { source: "extracted" as const, confidence: 0.8 };

    let styleGuide: StyleGuide | undefined;
    const images = (input.socialImages ?? []).slice(0, 15);
    if (images.length) {
      try {
        const raw = await analyseImages(images, STYLE_PROMPT, 1000);
        const parsed = StyleGuideSchema.safeParse(parseJSON(raw));
        if (parsed.success && parsed.data.promptSuffix) styleGuide = parsed.data;
      } catch (err) {
        console.warn("[social] style guide failed", err);
      }
      report(
        styleGuide
          ? { id: "style-guide", label: "Wrote a visual style guide", detail: styleGuide.promptSuffix, status: "done" }
          : { id: "style-guide", label: "Couldn't read their visual style", status: "warn" },
      );
    }
    if (styleGuide) patches.push({ patch: { expression: { styleGuide } }, options: opts });

    try {
      const r = await generateStructured(
        PlaybookSchema,
        "You are a senior social media strategist reverse-engineering a brand's real copywriting habits. Be specific and quote patterns, never generic.",
        playbookPrompt(model.name, posts),
        { task: "creative", maxTokens: 1500 },
      );
      const anchors = posts.filter((p) => p.isTop && p.caption.trim()).slice(0, ANCHORS).map((p) => p.caption.trim());
      const { formatMix, ...rest } = r;
      const playbook: Playbook = { ...rest, formatMix: cleanFormatMix(formatMix ?? []), postTypeMix: postTypeMix(posts), anchors };
      const avoid = Array.from(new Set([...(model.voice.vocabulary.avoid ?? []), ...r.blacklist]));
      patches.push({
        patch: { voice: { playbook, ...(avoid.length ? { vocabulary: { avoid } } : {}) } },
        options: opts,
      });
      report({
        id: "playbook",
        label: "Wrote a voice playbook",
        detail: r.pillars.map((p) => `${p.name} ${p.pct}%`).join(" · "),
        status: "done",
      });
    } catch (err) {
      console.warn("[social] playbook failed", err);
      report({ id: "playbook", label: "Couldn't write a voice playbook", status: "warn" });
    }
    return { patches };
  },
};
