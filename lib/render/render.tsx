import "server-only";
import { ImageResponse } from "next/og";
import type { BrandModel, LayoutId } from "@/lib/brand/model";
import type { GeneratedPost } from "@/lib/types";
import { layoutNeedsPhoto } from "@/lib/content/brief";
import { brandFonts } from "./fonts";
import { layoutKitOf } from "./kit";
import { LAYOUTS, type LayoutProps } from "./layouts";
import { applyShow, type ShowFlags } from "./show";

export type RenderSize = "1080x1350" | "1080x1080" | "1080x1920";

export interface RenderInput {
  model: BrandModel;
  post: Pick<GeneratedPost, "headline" | "subline" | "cta" | "items" | "stat" | "slides" | "caption" | "pillar">;
  layout: LayoutId;
  size: RenderSize;
  /** Data URIs, already resolved. */
  logo?: string;
  logoTone?: "light" | "dark";
  logoBoxed?: boolean;
  photo?: string;
  /** Mean brightness of the photo's lower 40% (0-255), for the scrim. */
  photoLuma?: number;
  /** Product carousel: cover collage photos. */
  photos?: string[];
  /** Product carousel: one photo per slide (index matches post.slides; cover and CTA are undefined). */
  slidePhotos?: (string | undefined)[];
  /** Hide the logo, call to action or supporting line. */
  show?: ShowFlags;
  /** Stamp a small "Made with AI" label in the bottom-right corner. */
  watermark?: boolean;
}

/** Renders one PNG per slide (one for a single-image post). */
export async function renderPost(raw: RenderInput): Promise<Buffer[]> {
  const input: RenderInput = raw.show?.image === false ? { ...raw, photo: undefined, photos: undefined, slidePhotos: undefined } : raw;
  const { model, size } = input;
  const { post, logo } = applyShow(input.post, input.logo, input.show);
  const [width, height] = size.split("x").map(Number);
  const kit = layoutKitOf(model)!;
  const t = model.expression.tokens;
  const fonts = await brandFonts(t.font.heading.$value, t.font.body.$value);
  const base: Omit<LayoutProps, "headline"> = {
    kit,
    colors: { primary: t.color.primary.$value, secondary: t.color.secondary.$value, accent: t.color.accent.$value, neutral: t.color.neutral.$value },
    fonts: { heading: fonts.heading, body: fonts.body },
    brandName: model.name,
    logo,
    logoTone: input.logoTone,
    logoBoxed: input.logoBoxed,
    textColor: model.expression.styleGuide?.textColor,
    textBox: model.expression.styleGuide?.textBox,
    width,
    height,
    kicker: post.pillar,
    photoLuma: input.photoLuma,
  };
  const headline = input.show?.headline === false ? "" : (post.headline || post.caption?.split(/[.!?\n]/)[0] || model.name).slice(0, 52);

  const frames: LayoutProps[] = [];
  const frameLayouts: LayoutId[] = [];
  if (input.layout === "product-cover" && (post.slides?.length ?? 0) >= 3) {
    const slides = post.slides!;
    const total = slides.length;
    slides.forEach((s, i) => {
      const slide = { index: i + 1, total };
      if (i === 0) {
        frameLayouts.push("product-cover");
        frames.push({ ...base, headline: input.show?.headline === false ? "" : s.headline || headline, subline: post.subline, photos: input.photos, photo: input.photos?.[0] ?? input.photo, slide });
      } else if (i === total - 1) {
        frameLayouts.push("carousel-slide");
        frames.push({ ...base, headline: s.headline, subline: s.body, cta: post.cta, slide, noNumber: true });
      } else {
        frameLayouts.push("product-slide");
        frames.push({ ...base, headline: s.headline, subline: s.body, photo: input.slidePhotos?.[i], slide });
      }
    });
  } else if (input.layout === "carousel-cover" && post.slides?.length) {
    const slides = post.slides;
    const total = slides.length;
    const photoAt = (i: number) => input.slidePhotos?.[i] ?? (i === 0 ? input.photo : undefined);
    frames.push({ ...base, headline: input.show?.headline === false ? "" : slides[0].headline || headline, subline: slides[0].body || post.subline, photo: photoAt(0), slide: { index: 1, total } });
    slides.slice(1).forEach((s, i) => frames.push({ ...base, headline: s.headline, subline: s.body, cta: post.cta, photo: photoAt(i + 1), slide: { index: i + 2, total } }));
  } else {
    frames.push({ ...base, headline, subline: post.subline, cta: post.cta, items: post.items, stat: post.stat, photo: layoutNeedsPhoto(input.layout) ? input.photo : undefined });
  }

  return Promise.all(
    frames.map(async (props, i) => {
      const Layout = LAYOUTS[frameLayouts[i] ?? (i === 0 ? input.layout : "carousel-slide")];
      const body = input.watermark ? (
        <div style={{ display: "flex", position: "relative", width, height }}>
          <Layout {...props} />
          <div style={{ display: "flex", position: "absolute", right: 24, bottom: 20, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 20 }}>Made with AI</div>
        </div>
      ) : (
        <Layout {...props} />
      );
      const res = new ImageResponse(body, {
        width,
        height,
        fonts: fonts.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      });
      return Buffer.from(await res.arrayBuffer());
    })
  );
}
