import "server-only";
import type { BrandModel } from "@/lib/brand/model";
import type { Session } from "@/lib/db/session";
import type { ContentHistory } from "@/lib/content/history";
import { llmScope } from "@/lib/db/llm-scope";
import { n8nEnabled, n8nRequest } from "@/lib/n8n";
import type { GeneratedPost, RenderedMedia } from "@/lib/types";
import { imageFromStorage, imageFromUrl, imageTone } from "./assets";
import { layoutKitOf } from "./kit";
import { museEnabled, museImage } from "./muse";

export type PhotoRef = NonNullable<RenderedMedia["photo"]>;

/** Brand photo for this post: least recently used one first (Phase 3b). */
export function pickBrandPhoto(model: BrandModel, history: ContentHistory): PhotoRef | undefined {
  const photos = model.expression.photos ?? [];
  if (!photos.length) return undefined;
  const lastUse = (path: string) => {
    const i = history.posts.findIndex((p) => p.photoPath === path);
    return i < 0 ? Infinity : i; // larger = longer ago
  };
  const best = [...photos].sort((a, b) => lastUse(b.path) - lastUse(a.path))[0];
  return { kind: "brand", ref: best.path };
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
export async function generatePhoto(session: Session | null, model: BrandModel, post: GeneratedPost, aspect: "4:5" | "1:1"): Promise<PhotoRef | undefined> {
  if (!post.imagePrompt) return undefined;

  if (museEnabled()) {
    const { paths, notes } = session ? referencePaths(model, post) : { paths: [], notes: [] };
    const refs = session ? (await Promise.all(paths.map((p) => imageFromStorage(session.db, "images", p, { maxSide: 1024 })))).filter((x): x is string => !!x) : [];
    const prompt = refs.length
      ? `Keep the product from the reference photo exactly as it looks (shape, label, colour) and place it in this scene: ${post.imagePrompt}${notes.length ? ` Product: ${notes.join("; ")}.` : ""}`
      : post.imagePrompt;
    const buf = await llmScope("image", { brandId: model.id }, () => museImage({ prompt, aspect, references: refs }));
    if (buf) {
      if (!session) return undefined; // nowhere to keep it; signed-out use falls through to n8n
      const { urls } = await storeImage(session, model.id, buf);
      if (urls[0]) return { kind: "generated", ref: urls[0] };
    }
  }

  if (!n8nEnabled()) return undefined;
  const { status, data } = await n8nRequest("generate-image", { prompt: post.imagePrompt, aspect, styled: true });
  if (status >= 400 || typeof data.imageUrl !== "string") {
    console.warn("[render] image generation failed", data.error);
    return undefined;
  }
  return { kind: "generated", ref: data.imageUrl };
}

/** Chooses where the photo comes from: a real brand photo when it fits, else a generated one. */
export async function resolvePhoto(session: Session | null, model: BrandModel, post: GeneratedPost, history: ContentHistory, aspect: "4:5" | "1:1"): Promise<PhotoRef | undefined> {
  const brand = pickBrandPhoto(model, history);
  if (brand && post.visualBrief?.usesProductPhoto) return brand;
  return (await generatePhoto(session, model, post, aspect)) ?? brand;
}

/** Loads the photo and logo as data URIs for Satori. */
export async function loadVisuals(session: Session | null, model: BrandModel, photo: PhotoRef | undefined) {
  const kit = layoutKitOf(model)!;
  const duotone = kit.photoTreatment === "duotone" ? model.expression.tokens.color.primary.$value : undefined;
  const [photoUri, logoUri] = await Promise.all([
    !photo
      ? undefined
      : photo.kind === "brand"
      ? session
        ? imageFromStorage(session.db, "images", photo.ref, { maxSide: 1400, duotone })
        : undefined
      : imageFromUrl(photo.ref, { maxSide: 1400, duotone }),
    model.expression.logoPath && session
      ? imageFromStorage(session.db, "logos", model.expression.logoPath, { maxSide: 512, keepAlpha: true })
      : imageFromUrl(model.expression.logoUrl, { maxSide: 512, keepAlpha: true }),
  ]);
  return { photo: photoUri, logo: logoUri, logoTone: await imageTone(logoUri) };
}

/** Product photos (images bucket) as data URIs, in order; missing ones come back undefined. */
export async function loadSlidePhotos(session: Session | null, model: BrandModel, paths: (string | undefined)[]): Promise<(string | undefined)[]> {
  if (!session) return paths.map(() => undefined);
  const kit = layoutKitOf(model)!;
  const duotone = kit.photoTreatment === "duotone" ? model.expression.tokens.color.primary.$value : undefined;
  return Promise.all(paths.map((p) => (p ? imageFromStorage(session.db, "images", p, { maxSide: 1400, duotone }) : Promise.resolve(undefined))));
}

const SIGN_SECONDS =60 * 60 * 24 * 30;

export interface EncodedImage {
  buf: Buffer;
  mime: "image/png" | "image/jpeg";
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
export async function storeImage(s: Session, brandId: string, buf: Buffer): Promise<{ paths: string[]; urls: string[] }> {
  const path = `${s.workspaceId}/brands/${brandId}/generated/${crypto.randomUUID()}.jpg`;
  return uploadImages(s, brandId, [path], [{ buf, mime: "image/jpeg" }]);
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
    }))
  );
  if (maErr) console.warn("[media_assets]", maErr.message);
  return { paths, urls: await signPaths(s, "images", paths) };
}

export async function signPaths(s: Session, bucket: string, paths: string[], seconds = SIGN_SECONDS): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await s.db.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error || !data) throw new Error(`Couldn't sign image links: ${error?.message}`);
  return data.map((d) => d.signedUrl ?? "");
}
