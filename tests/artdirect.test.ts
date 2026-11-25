import { describe, expect, it } from "vitest";
import { ArtDirectionSchema, buildArtDirectorUser, imagePromptFromDirection, stripTextCardSentences } from "@/lib/content/artdirect";
import type { GeneratedPost } from "@/lib/types";

const post = {
  caption: "c",
  hashtags: [],
  imagePrompt: "",
  cta: "Order today",
  bestTimeToPost: "",
  postType: "Single image",
  platformVariants: {},
  headline: "Slow mornings",
  subline: "Fresh roasted weekly",
  items: ["Small batch"],
  visualBrief: { subject: "a ceramic cup", setting: "stone table", lighting: "morning light", composition: "overhead", usesProductPhoto: false },
} as GeneratedPost;

const direction = {
  inspired_by_post_id: "top-1",
  layout_archetype: "split layout, subject right",
  negative_space_zone: "left 45% of frame",
  compiled_image_prompt: "A 50mm eye-level medium shot of a barista in deep forest green #1B4332 apron holding a matte ceramic cup on a stone counter, soft window light, warm terracotta accents, calm empty space on the left for the headline.",
  overlay_text_layers: { headline: "Slow mornings", subhead: "", supporting_bullets: [], cta: "Order today" },
  negative_prompt: "distorted text, extra fingers, watermark",
};

describe("art director", () => {
  it("accepts the specified JSON shape and rejects a too-short prompt", () => {
    expect(ArtDirectionSchema.safeParse(direction).success).toBe(true);
    expect(ArtDirectionSchema.safeParse({ ...direction, compiled_image_prompt: "short" }).success).toBe(false);
  });

  it("builds the user message with the exact copy and past posts", () => {
    const u = buildArtDirectorUser({ post, brandName: "Acme", topPosts: [{ id: "top-1", caption: "Our best roast" }] });
    expect(u).toContain("BRAND_MODEL");
    expect(u).toContain('"headline": "Slow mornings"');
    expect(u).toContain("top-1");
    expect(u).toContain("a ceramic cup");
  });

  it("says so when there are no past posts", () => {
    expect(buildArtDirectorUser({ post, topPosts: [] })).toContain("none available");
  });

  it("final image prompt keeps the layout, forbids in-image text and appends exclusions", () => {
    const p = imagePromptFromDirection(ArtDirectionSchema.parse(direction));
    expect(p).toContain("left 45% of frame");
    expect(p).toContain("do not render any text");
    expect(p).toContain("Avoid: distorted text");
  });

  it("strips sentences that ask the image model to draw an overlay card", () => {
    const out = stripTextCardSentences("A runner at dawn. The overlay zone is a dark card ready for white text. Soft light.");
    expect(out).toBe("A runner at dawn. Soft light.");
  });
});
