import "server-only";
import type { BrandModel } from "@/lib/brand/model";
import { paletteToWords } from "@/lib/brand/color";
import { llmScope } from "@/lib/db/llm-scope";
import type { Session } from "@/lib/db/session";
import { signAssetBuffer } from "@/lib/render/c2pa";
import { imageFromStorage } from "@/lib/render/assets";
import { storeImage } from "@/lib/render/media";
import { museEnabled, museImage, type MuseAspect } from "@/lib/render/muse";
import { scenePrompt } from "@/lib/render/scenes";

// Place a real catalogue product into an on-brand scene with Meta Muse (image edits with the product photo
// as a reference). Stage 1 isolates the product once per SKU and caches it; stage 2 composes the scene and
// signs the result with C2PA (intent "edit", the catalogue photo as parent).

interface ProductRow {
  id: string;
  brand_id: string;
  name: string;
  description?: string | null;
  image_paths: string[];
  cutout_url?: string | null;
  cutout_status?: string | null;
}

const KEEP = "Keep the product exactly as in the reference photo: same shape, proportions, colours, label text and logo. Do not redraw, translate, restyle or invent any packaging text.";

const dataUrlToBuffer = (u: string) => Buffer.from(u.split(",")[1] ?? "", "base64");

async function loadProduct(s: Session, productId: string): Promise<ProductRow> {
  const { data, error } = await s.db.from("products").select("id, brand_id, name, description, image_paths, cutout_url, cutout_status").eq("id", productId).maybeSingle();
  if (error || !data) throw new Error("Product not found.");
  if (!data.image_paths?.length) throw new Error("This product has no photo yet. Add one first.");
  return data as ProductRow;
}

/** Stage 1: product isolated on a clean seamless background, made once and cached on the product row. Returns the storage path. */
export async function createProductCutout(s: Session, productId: string, force = false): Promise<string | undefined> {
  const p = await loadProduct(s, productId);
  if (p.cutout_url && p.cutout_status === "ready" && !force) return p.cutout_url;
  if (!museEnabled()) return undefined;
  const ref = await imageFromStorage(s.db, "images", p.image_paths[0], { maxSide: 1024 });
  if (!ref) return undefined;
  const buf = await llmScope("image", { brandId: p.brand_id }, () =>
    museImage({ prompt: `Isolate the product on a plain, pure white seamless background, centred with even margin, soft contact shadow only. ${KEEP}`, aspect: "1:1", references: [ref] })
  );
  if (!buf) {
    await s.db.from("products").update({ cutout_status: "failed" }).eq("id", p.id);
    return undefined;
  }
  const path = `${s.workspaceId}/brands/${p.brand_id}/cutouts/${p.id}.jpg`;
  const { error } = await s.db.storage.from("images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Couldn't save the cutout: ${error.message}`);
  await s.db.from("products").update({ cutout_url: path, cutout_status: "ready" }).eq("id", p.id);
  return path;
}

export interface SceneResult {
  path: string;
  url: string;
  c2paSigned: boolean;
}

/** Stage 2: the product in a new scene, signed as an edit of the catalogue photo and saved to the workspace assets. */
export async function compositeProductScene(
  s: Session,
  o: { productId: string; model: BrandModel; scene?: string; sceneText?: string; aspect?: MuseAspect }
): Promise<SceneResult | undefined> {
  if (!museEnabled()) return undefined;
  const p = await loadProduct(s, o.productId);
  const original = await imageFromStorage(s.db, "images", p.image_paths[0], { maxSide: 1400 });
  if (!original) return undefined;
  const cutoutPath = await createProductCutout(s, p.id).catch(() => undefined);
  const cutout = cutoutPath ? await imageFromStorage(s.db, "images", cutoutPath, { maxSide: 1024 }) : undefined;

  const c = o.model.expression.tokens.color;
  const palette = paletteToWords([c.primary.$value, c.secondary.$value, c.accent.$value]).join(", ");
  const scene = scenePrompt(`A lifestyle scene that suits a ${p.name} and the brand's mood.`, o.scene, o.sceneText);
  const prompt = [
    `Place the product from the first reference photo${cutout ? " (the second image is a clean cutout of it)" : ""} into this scene: ${scene}`,
    `Match lighting, shadows and surface reflections to the scene. Colour palette cues: ${palette}.`,
    `Product: ${p.name}${p.description ? `: ${p.description.slice(0, 120)}` : ""}.`,
    KEEP,
  ].join(" ");
  const buf = await llmScope("image", { brandId: p.brand_id }, () => museImage({ prompt, aspect: o.aspect ?? "4:5", references: cutout ? [original, cutout] : [original] }));
  if (!buf) return undefined;

  const parent = { buffer: dataUrlToBuffer(original), mimeType: original.slice(5, original.indexOf(";")) || "image/jpeg", title: p.name };
  const signed = await signAssetBuffer(buf, "image/jpeg", { intent: "edit", parent });
  const { paths, urls } = await storeImage(s, p.brand_id, signed.buf, { sourceType: "product_composite", c2paSigned: signed.signed });
  return { path: paths[0], url: urls[0], c2paSigned: signed.signed };
}
