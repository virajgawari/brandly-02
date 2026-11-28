import "server-only";
import type { BrandModel } from "@/lib/brand/model";
import type { Session } from "@/lib/db/session";
import type { ContentHistory } from "@/lib/content/history";
import { llmScope } from "@/lib/db/llm-scope";
import { n8nEnabled, n8nRequest } from "@/lib/n8n";
import type { GeneratedPost, RenderedMedia } from "@/lib/types";
import { bottomLuminance, imageFromStorage, imageFromUrl, imageTone, logoHasWhiteBox } from "./assets";
import { layoutKitOf } from "./kit";
import { museEnabled, museImage, type MuseAspect } from "./muse";
import type { RefKind } from "@/lib/social/store";

/**
 * Duotone greyscales every photo. It is only a guess from the brand's mood, so a style guide learned
 * from the brand's real (colour) posts takes priority and photos stay in full colour.
 */
function duotoneFor(model: BrandModel, kit: { photoTreatment: string }): string | undefined {
  if (kit.photoTreatment !== "duotone" || model.expression.styleGuide) return undefined;
  return model.expression.tokens.color.primary.$value;
}

export type PhotoRef = NonNullable<RenderedMedia["photo"]>;

/** Brand photo for this post: least recently used one first (Phase 3b). */
export function pickBrandPhoto(model: BrandModel, history: ContentHistory, preferProduct = false): PhotoRef | undefined {
  return pickBrandPhotos(model, history, 1, preferProduct)[0];
}

/** Up to `n` different brand photos, least recently used first (a carousel gets a different photo per slide). */
export function pickBrandPhotos(model: BrandModel, history: ContentHistory, n: number, preferProduct = false): PhotoRef[] {
  const all = model.expression.photos ?? [];
  // A product post uses product photos when there are any; otherwise any brand photo.
  const products = preferProduct ? all.filter((p) => p.role === "product") : [];
  const photos = products.length ? products : all;
  const lastUse = (path: string) => {
    const i = history.posts.findIndex((p) => p.photoPath === path);
    return i < 0 ? Infinity : i; // larger = longer ago
  };
  return [...photos]
    .sort((a, b) => lastUse(b.path) - lastUse(a.path))
    .slice(0, Math.max(0, n))
    .map((p) => ({ kind: "brand" as const, ref: p.path }));
}

/** Product photos the generated image should be based on: the post's first slide photo, else brand product photos. */
function referencePaths(model: BrandModel, post: GeneratedPost): { paths: string[]; notes: string[] } {
  const slidePath = post.slides?.find((s) => s.photoPath)?.photoPath;
  if (slidePath) {
    const match = (model.expression.photos ?? []).find((p) => p.path === slidePath);
    return { paths: [slidePath], notes: match?.product ? [[match.product.name, match.product.note].filter(Boolean).join(": ")] : [] };
  }
  if (!post.visualBrief?.usesProductPhoto) return { paths: [], notes: [] };
  const products = (model.expression.photos ?? []).filter((p) => p.role === "product").slice(0, 2);
  return {
    paths: products.map((p) => p.path),
    notes: products.flatMap((p) => (p.product ? [[p.product.name, p.product.note].filter(Boolean).join(": ")] : [])),
  };
}

/** Generated photo: Muse Image first (based on the brand's product photos when the post features one), then the n8n workflow. */
export async function generatePhoto(session: Session | null, model: BrandModel, post: GeneratedPost, aspect: MuseAspect, promptOverride?: string, opts?: { kind?: RefKind; slide?: number }): Promise<PhotoRef | undefined> {
  const imagePrompt = promptOverride ?? post.imagePrompt;
  if (!imagePrompt) return undefined;

  if (museEnabled()) {
    const { paths, notes } = session && !promptOverride ? referencePaths(model, post) : { paths: [], notes: [] };
    const load = async (list: string[]) =>
      session ? (await Promise.all(list.map((p) => imageFromStorage(session.db, "images", p, { maxSide: 1024 })))).filter((x): x is string => !!x) : [];
    // Style refs were dropped: /images/edits copies the reference's subject and colours, so only product photos go in.
    // Everything else is a fresh /images/generations call steered by the art-directed prompt plus the style guide.
    const productRefs = await load(paths);
    const suffix = model.expression.styleGuide?.promptSuffix?.trim();
    const styled = suffix && !imagePrompt.includes(suffix.slice(0, 40)) ? `${imagePrompt} ${suffix}` : imagePrompt;
    const prompt = productRefs.length
      ? [`Keep the product from the reference photo exactly as it looks (shape, label, colour) and place it in this scene:`, styled, notes.length && `Product: ${notes.join("; ")}.`].filter(Boolean).join(" ")
      : styled;
    const refs = productRefs;
    const buf = await llmScope("image", { brandId: model.id }, () => museImage({ prompt, aspect, references: refs }));
    if (buf) {
      if (!session) return undefined; // nowhere to keep it; signed-out use falls through to n8n
      const { urls } = await storeImage(session, model.id, buf);
      if (urls[0]) return { kind: "generated", ref: urls[0] };
    }
  }

  if (!n8nEnabled()) return undefined;
  const { status, data } = await n8nRequest("generate-image", { prompt: imagePrompt, aspect, styled: true });
  if (status >= 400 || typeof data.imageUrl !== "string") {
    console.warn("[render] image generation failed", data.error);
    return undefined;
  }
  return { kind: "generated", ref: data.imageUrl };
}

/** Prompt for one carousel slide: the post's visual brief plus what this slide says, so slides don't repeat the same scene. */
export function slidePrompt(post: GeneratedPost, index: number): string {
  const s = post.slides?.[index];
  const idea = [s?.headline, s?.body].filter(Boolean).join(" — ");
  return `${post.imagePrompt ?? ""} This image illustrates slide ${index + 1} of ${post.slides?.length ?? 1}: "${idea}". Show that idea with a different scene, angle or detail from the other slides, same style and mood.`.trim();
}

/** One generated photo per carousel slide, made in parallel to stay inside the route's time limit. */
export async function generateSlidePhotos(session: Session | null, model: BrandModel, post: GeneratedPost, aspect: MuseAspect): Promise<(PhotoRef | undefined)[]> {
  const n = post.slides?.length ?? 0;
  return Promise.all(Array.from({ length: n }, (_, i) => generatePhoto(session, model, post, aspect, slidePrompt(post, i), { kind: "carousel", slide: i })));
}

/** A photo for every slide: missing ones reuse the photos we have, in turn. Empty when there are none. */
export function fillSlidePhotos<T>(photos: (T | undefined | null)[], count: number): T[] {
  const have = photos.filter((p): p is T => !!p);
  if (!have.length) return [];
  return Array.from({ length: count }, (_, i) => photos[i] ?? have[i % have.length]);
}

/** Photo data URIs for Satori, with the kit's photo treatment. */
export async function loadPhotoRefs(session: Session | null, model: BrandModel, refs: PhotoRef[]): Promise<(string | undefined)[]> {
  const kit = layoutKitOf(model)!;
  const duotone = duotoneFor(model, kit);
  return Promise.all(
    refs.map((r) =>
      r.kind === "brand"
        ? session
          ? imageFromStorage(session.db, "images", r.ref, { maxSide: 1400, duotone })
          : Promise.resolve(undefined)
        : imageFromUrl(r.ref, { maxSide: 1400, duotone })
    )
  );
}

/** Chooses where the photo comes from: the brand's own photo whenever it has one, else a generated one. */
export async function resolvePhoto(session: Session | null, model: BrandModel, post: GeneratedPost, history: ContentHistory, aspect: MuseAspect): Promise<PhotoRef | undefined> {
  // With a style guide, Muse renders every post in the brand's look; real photos are the fallback.
  if (model.expression.styleGuide && museEnabled()) {
    const generated = await generatePhoto(session, model, post, aspect);
    if (generated) return generated;
  }
  const brand = pickBrandPhoto(model, history, !!post.visualBrief?.usesProductPhoto);
  if (brand) return brand;
  return generatePhoto(session, model, post, aspect);
}

/** Loads the photo and logo as data URIs for Satori. */
export async function loadVisuals(session: Session | null, model: BrandModel, photo: PhotoRef | undefined) {
  const kit = layoutKitOf(model)!;
  const duotone = duotoneFor(model, kit);
  const [photoUri, logoUri] = await Promise.all([
    !photo
      ? undefined
      : photo.kind === "brand"
      ? session
        ? imageFromStorage(session.db, "images", photo.ref, { maxSide: 1400, duotone, upscale: true })
        : undefined
      : imageFromUrl(photo.ref, { maxSide: 1400, duotone, upscale: true }),
    model.expression.logoPath && session
      ? imageFromStorage(session.db, "logos", model.expression.logoPath, { maxSide: 512, keepAlpha: true })
      : imageFromUrl(model.expression.logoUrl, { maxSide: 512, keepAlpha: true }),
  ]);
  return { photo: photoUri, logo: logoUri, logoTone: await imageTone(logoUri), logoBoxed: await logoHasWhiteBox(logoUri), photoLuma: await bottomLuminance(photoUri) };
}

/** Product photos (images bucket) as data URIs, in order; missing ones come back undefined. */
export async function loadSlidePhotos(session: Session | null, model: BrandModel, paths: (string | undefined)[]): Promise<(string | undefined)[]> {
  if (!session) return paths.map(() => undefined);
  const kit = layoutKitOf(model)!;
  const duotone = duotoneFor(model, kit);
  return Promise.all(paths.map((p) => (p ? imageFromStorage(session.db, "images", p, { maxSide: 1400, duotone }) : Promise.resolve(undefined))));
}

const SIGN_SECONDS =60 * 60 * 24 * 30;

export interface EncodedImage {
  buf: Buffer;
  mime: "image/png" | "image/jpeg";
  /** Provenance stored on the media asset so the publisher can pass platform AI self-disclosure flags. */
  provenance?: { sourceType: "uploaded" | "synthetic" | "product_composite"; c2paSigned: boolean };
}

/** PNG from Satori → JPEG (much smaller, accepted by every network). Keeps PNG if sharp is missing. */
export async function encodeForUpload(png: Buffer, quality = 90): Promise<EncodedImage> {
  try {
    const sharp = (await import("sharp")).default;
    return { buf: await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer(), mime: "image/jpeg" };
  } catch {
    return { buf: png, mime: "image/png" };
  }
}

/** Saves an AI-generated JPEG to the images bucket (generated/ folder) and signs it. */
export async function storeImage(s: Session, brandId: string, buf: Buffer, provenance: EncodedImage["provenance"] = { sourceType: "synthetic", c2paSigned: false }): Promise<{ paths: string[]; urls: string[] }> {
  const path = `${s.workspaceId}/brands/${brandId}/generated/${crypto.randomUUID()}.jpg`;
  return uploadImages(s, brandId, [path], [{ buf, mime: "image/jpeg", provenance }]);
}

/** Uploads rendered images to the images bucket and records them as media assets. */
export async function storeRendered(s: Session, brandId: string, key: string, images: EncodedImage[]): Promise<{ paths: string[]; urls: string[] }> {
  const paths = images.map((img, i) => `${s.workspaceId}/brands/${brandId}/posts/${key}/${i + 1}.${img.mime === "image/png" ? "png" : "jpg"}`);
  return uploadImages(s, brandId, paths, images);
}

async function uploadImages(s: Session, brandId: string, paths: string[], images: EncodedImage[]): Promise<{ paths: string[]; urls: string[] }> {
  await Promise.all(
    images.map(async (img, i) => {
      const { error } = await s.db.storage.from("images").upload(paths[i], img.buf, { contentType: img.mime, upsert: true });
      if (error) throw new Error(`Couldn't save the image: ${error.message}`);
    })
  );
  const { error: maErr } = await s.db.from("media_assets").insert(
    images.map((img, i) => ({
      workspace_id: s.workspaceId,
      brand_id: brandId,
      kind: "image",
      storage_path: paths[i],
      mime: img.mime,
      bytes: img.buf.byteLength,
      created_by: s.userId,
      ...(img.provenance
        ? { source_type: img.provenance.sourceType, c2pa_signed: img.provenance.c2paSigned, is_ai_generated: img.provenance.sourceType !== "uploaded", has_synthetic_visual: img.provenance.sourceType === "synthetic" }
        : {}),
    }))
  );
  if (maErr) console.warn("[media_assets]", maErr.message);
  return { paths, urls: await signPaths(s, "images", paths) };
}

export async function signPaths(s: { db: Pick<Session["db"], "storage"> }, bucket: string, paths: string[], seconds = SIGN_SECONDS): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await s.db.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error || !data) throw new Error(`Couldn't sign image links: ${error?.message}`);
  return data.map((d) => d.signedUrl ?? "");
}
