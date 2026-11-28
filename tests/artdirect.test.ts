import { describe, expect, it } from "vitest";
import { ArtDirectionSchema, artFromPost, imagePromptFromDirection, stripTextCardSentences } from "@/lib/content/artdirect";

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

  it("attaches the final copy as overlay text and rejects a bad art object", () => {
    const art = artFromPost(direction, { headline: "Slow mornings", subline: "Fresh roasted weekly", items: ["Small batch"], cta: "Order today" });
    expect(art?.overlay_text_layers.headline).toBe("Slow mornings");
    expect(art?.overlay_text_layers.cta).toBe("Order today");
    expect(artFromPost({ ...direction, compiled_image_prompt: "short" }, {})).toBeNull();
    expect(artFromPost(undefined, {})).toBeNull();
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
