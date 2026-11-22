import { NextRequest, NextResponse } from "next/server";
import { LAYOUT_IDS, type BrandModel, type LayoutId } from "@/lib/brand/model";
import { chooseLayout, layoutNeedsPhoto } from "@/lib/content/brief";
import { recentPosts } from "@/lib/content/history";
import { errorResponse, requireSession } from "@/lib/db/session";
import { layoutKitOf } from "@/lib/render/kit";
import { museEnabled } from "@/lib/render/muse";
import { encodeForUpload, fillSlidePhotos, generatePhoto, generateSlidePhotos, loadPhotoRefs, loadSlidePhotos, loadVisuals, pickBrandPhotos, resolvePhoto, storeRendered, type PhotoRef } from "@/lib/render/media";
import { renderPost, type RenderSize } from "@/lib/render/render";
import { scenePrompt } from "@/lib/render/scenes";
import { cleanShow, type ShowFlags } from "@/lib/render/show";
import type { GeneratedPost, RenderedMedia } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  brandModel: BrandModel;
  post: GeneratedPost;
  /** Defaults to post.layout, then a layout chosen from the brand kit. */
  layout?: LayoutId;
  size?: RenderSize;
  /** Omit (or "auto") to choose a photo; "generate" for a new AI photo; null for none; or reuse an earlier choice. */
  photo?: PhotoRef | null | "auto" | "generate";
  /** Look for a new AI photo: a preset id from lib/render/scenes, and/or free text on what to show. */
  scene?: string;
  sceneText?: string;
  /** Carousel: the photos already chosen, one per slide (reused so layout or text edits don't regenerate them). */
  slidePhotos?: (PhotoRef | null)[];
  /** Save to storage and return signed URLs (needs sign-in). Otherwise returns small JPEG previews. */
  store?: boolean;
  /** Folder name for stored images (usually the post id). */
  key?: string;
  /** Hide the logo, call to action or supporting line (all shown by default). */
  show?: ShowFlags;
}

// Renders the post as the brand's own branded image(s): its fonts, colours, logo and layout kit.
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Body;
    if (!b.brandModel?.expression || !b.post) return NextResponse.json({ error: "brandModel and post are required" }, { status: 400 });
    const model = b.brandModel;
    const size: RenderSize = b.size === "1080x1080" || b.size === "1080x1920" ? b.size : "1080x1350";
    const session = await requireSession();

    const show = cleanShow(b.show);
    const kit = layoutKitOf(model)!;
    const history = await recentPosts(model.id, 15, session);
    const wanted = b.layout ?? b.post.layout;
    const layout: LayoutId =
      wanted && (LAYOUT_IDS as readonly string[]).includes(wanted)
        ? wanted
        : chooseLayout(kit, b.post.format, history, { textOnImagePct: model?.expression.styleGuide?.textOnImagePct, carousel: (b.post.slides?.length ?? 0) >= 2 });

    const aspect = size === "1080x1080" ? "1:1" : size === "1080x1920" ? "9:16" : "4:5";
    const isProduct = layout === "product-cover";
    let photo: PhotoRef | undefined = typeof b.photo === "object" && b.photo ? b.photo : undefined;
    const slideCount = b.post.slides?.length ?? 0;
    // Only a new AI photo uses the chosen scene.
    const genPost = b.photo === "generate" ? { ...b.post, imagePrompt: scenePrompt(b.post.imagePrompt, b.scene, b.sceneText) ?? b.post.imagePrompt } : b.post;
    const isCarousel = layout === "carousel-cover" && slideCount >= 2;
    let slideRefs: PhotoRef[] | undefined;
    let noneGenerated = false;
    if (isProduct) {
      // Product photos come from the slides themselves; nothing to choose or generate.
    } else if (isCarousel) {
      // Every slide gets its own photo. Reuse the ones we were given; only generate when asked or when nothing was chosen yet.
      const given = (b.slidePhotos ?? []).filter((x): x is PhotoRef => !!x);
      if (b.photo === "generate") {
        const made = await generateSlidePhotos(session, model, genPost, aspect);
        noneGenerated = !made.some(Boolean);
        slideRefs = fillSlidePhotos(made, slideCount);
      } else if (given.length) slideRefs = fillSlidePhotos(b.slidePhotos ?? [], slideCount);
      else if (photo) slideRefs = fillSlidePhotos([photo], slideCount);
      else if (b.photo === undefined || b.photo === "auto") {
        // With a learned style guide, Muse renders the slides in the brand's look; real photos are the fallback.
        const styled = model.expression.styleGuide && museEnabled() ? await generateSlidePhotos(session, model, b.post, aspect) : [];
        const brand = styled.some(Boolean) ? [] : pickBrandPhotos(model, history, slideCount, !!b.post.visualBrief?.usesProductPhoto);
        if (styled.some(Boolean)) slideRefs = fillSlidePhotos(styled, slideCount);
        else if (brand.length) slideRefs = fillSlidePhotos(brand, slideCount);
        else slideRefs = fillSlidePhotos(await generateSlidePhotos(session, model, b.post, aspect), slideCount);
      }
      photo = slideRefs?.[0];
    } else if (b.photo === "generate") photo = await generatePhoto(session, model, genPost, aspect);
    else if ((b.photo === undefined || b.photo === "auto") && layoutNeedsPhoto(layout)) photo = await resolvePhoto(session, model, b.post, history, aspect);
    const photoError = b.photo === "generate" && !isProduct && (isCarousel ? noneGenerated : !photo) ? "Couldn't make new photos, try again." : undefined;

    const visuals = await loadVisuals(session, model, isCarousel ? undefined : photo);
    const carouselPhotos = isCarousel && slideRefs?.length ? await loadPhotoRefs(session, model, slideRefs) : undefined;
    const slidePhotos = isProduct ? await loadSlidePhotos(session, model, (b.post.slides ?? []).map((s) => s.photoPath)) : undefined;
    const photos = slidePhotos?.filter((x): x is string => !!x).slice(0, 4);
    const { data: ws } = await session.db.from("workspaces").select("ai_watermark").eq("id", session.workspaceId).maybeSingle();
    const pngs = await renderPost({ watermark: !!ws?.ai_watermark, model, post: b.post, layout, size, logo: visuals.logo, logoTone: visuals.logoTone, photo: isCarousel ? carouselPhotos?.[0] : visuals.photo, photos, slidePhotos: isCarousel ? carouselPhotos : slidePhotos, show });

    let rendered: RenderedMedia;
    if (b.store) {
      const key = (b.key ?? crypto.randomUUID()).replace(/[^\w-]/g, "").slice(0, 64) || crypto.randomUUID();
      const encoded = await Promise.all(pngs.map((p) => encodeForUpload(p)));
      const { paths, urls } = await storeRendered(session, model.id, key, encoded);
      rendered = { layout, paths, urls, size, photo, slidePhotos: slideRefs, show };
    } else {
      const previews = await Promise.all(pngs.map((p) => encodeForUpload(p, 80)));
      rendered = { layout, paths: [], urls: previews.map((x) => `data:${x.mime};base64,${x.buf.toString("base64")}`), size, photo, slidePhotos: slideRefs, show };
    }
    return NextResponse.json({ rendered, layouts: kit.layouts, photoError });
  } catch (err) {
    return errorResponse(err, "render-post");
  }
}
