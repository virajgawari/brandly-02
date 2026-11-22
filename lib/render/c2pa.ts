import "server-only";

// C2PA Content Credentials for AI-touched images (machine-readable provenance instead of a visible stamp).
// Keys come from C2PA_SIGNING_CERT / C2PA_PRIVATE_KEY (PEM, "\n" escapes allowed). Without them signing is a
// no-op, so local dev and CI keep working; the unsigned buffer is returned.

export const TRAINED_ALGORITHMIC = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export type SignIntent =
  /** Fully synthetic image (Muse scene): created by a trained model. */
  | { intent: "create" }
  /** Real product photo composited into a scene: an edit of the catalogue photo, which becomes the parent ingredient. */
  | { intent: "edit"; parent: { buffer: Buffer; mimeType: string; title?: string } };

export interface SignResult {
  buf: Buffer;
  signed: boolean;
}

export const c2paConfigured = () => !!process.env.C2PA_SIGNING_CERT?.trim() && !!process.env.C2PA_PRIVATE_KEY?.trim();

const pem = (v: string) => Buffer.from(v.replace(/\n/g, "\n").trim() + "\n");

/** Signs `buf` (JPEG or PNG). Never throws: on any failure the original bytes come back with signed=false. */
export async function signAssetBuffer(buf: Buffer, mimeType: "image/jpeg" | "image/png", opts: SignIntent): Promise<SignResult> {
  if (!c2paConfigured()) return { buf, signed: false };
  try {
    const { Builder, LocalSigner } = await import("@contentauth/c2pa-node");
    const signer = LocalSigner.newSigner(pem(process.env.C2PA_SIGNING_CERT!), pem(process.env.C2PA_PRIVATE_KEY!), (process.env.C2PA_SIGNING_ALG?.trim() as "es256") || "es256", process.env.C2PA_TSA_URL?.trim() || undefined);
    const builder = await Builder.newAsync();
    if (opts.intent === "create") {
      builder.setIntent({ create: TRAINED_ALGORITHMIC });
    } else {
      builder.setIntent("edit");
      await builder.addIngredient(
        JSON.stringify({ title: opts.parent.title ?? "catalogue-product", format: opts.parent.mimeType, instance_id: `product-${crypto.randomUUID()}`, relationship: "parentOf" }),
        { buffer: opts.parent.buffer, mimeType: opts.parent.mimeType }
      );
    }
    const dest: { buffer: Buffer | null } = { buffer: null };
    builder.sign(signer, { buffer: buf, mimeType }, dest);
    return dest.buffer ? { buf: dest.buffer, signed: true } : { buf, signed: false };
  } catch (err) {
    console.warn("[c2pa] signing skipped:", err instanceof Error ? err.message : err);
    return { buf, signed: false };
  }
}
