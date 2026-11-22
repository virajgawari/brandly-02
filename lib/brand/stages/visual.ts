import { friendlyError } from "@/lib/errors";
import { analyseImages, parseJSON } from "../../llm";
import { imagePixels } from "../../render/assets";
import { brandColours, kmeans, poolPalettes, PIXELS_VERSION, type Cluster } from "../../measure/pixels";
import { ImageTagsSchema, type ImageTags } from "../schemas";
import { TAG_PROMPT } from "../describe";
import type { Measures } from "../model";
import type { IngestOutput } from "./ingest";
import type { StageDefinition } from "./types";

export interface VisualImage {
  url: string;
  colors: string[];
  tags?: ImageTags;
}

export interface VisualOutput {
  pixels?: NonNullable<Measures["pixels"]>;
  /** Per-photo colours and tags; copied onto brand photos after the run, then removed before the browser. */
  photoInsights?: VisualImage[];
}

const MAX_PHOTOS = 6;
const PHOTO_CONCURRENCY = 5;

/** Measures colours from the logo and photo pixels and tags the photos with one vision call. */
export type VisualInput = IngestOutput & {
  /** Result of the same work started during the crawl (see `startVisual`). */
  visualPre?: VisualResult;
  /** Data URI of a logo the owner uploaded. Preferred over the one found on the website. */
  logoImage?: string;
};

export interface VisualResult {
  output: VisualOutput;
}

type Report = (f: import("./types").Finding) => void;

/** Logo + photo colours and one vision call. Photos are fetched in parallel. */
export async function analyseVisual(logoSource: string | undefined, photoUrls: string[], logoFromUpload: boolean, report: Report): Promise<VisualResult> {
  const logoP = logoSource ? imagePixels(logoSource) : Promise.resolve(null);
  const urls = photoUrls.slice(0, MAX_PHOTOS);
  const pxs: (Awaited<ReturnType<typeof imagePixels>> | null)[] = new Array(urls.length).fill(null);
  let cursor = 0;
  const pool = Array.from({ length: Math.min(PHOTO_CONCURRENCY, urls.length) }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      try {
        pxs[i] = await imagePixels(urls[i]);
      } catch {
        pxs[i] = null;
      }
    }
  });
  const [logo] = await Promise.all([logoP.catch(() => null), ...pool]);

  const logoPalette = logo ? brandColours(kmeans(logo.data, logo.channels, { k: 4 })) : [];
  if (logoPalette.length) report({ id: "logo-colours", label: logoFromUpload ? "Measured colours from the logo you uploaded" : "Measured colours from your logo", status: "done", swatches: logoPalette });

  const images: VisualImage[] = [];
  const jpegs: Buffer[] = [];
  const jpegOwner: number[] = [];
  const palettes: Cluster[][] = [];
  urls.forEach((url, i) => {
    const px = pxs[i];
    if (!px) return;
    const clusters = kmeans(px.data, px.channels, { k: 5 });
    palettes.push(clusters);
    images.push({ url, colors: brandColours(clusters) });
    if (px.jpeg512) {
      jpegs.push(px.jpeg512);
      jpegOwner.push(images.length - 1);
    }
  });
  const photoPalette = poolPalettes(palettes).map((c) => c.hex);

  if (jpegs.length) {
    try {
      const raw = await analyseImages(jpegs.map((b) => b.toString("base64")), TAG_PROMPT, 1200);
      const tags = ImageTagsSchema.parse(parseJSON(raw) ?? []);
      let tagged = 0;
      for (const t of tags) {
        const owner = jpegOwner[t.index];
        if (owner === undefined || images[owner].tags) continue;
        images[owner].tags = t;
        tagged++;
      }
      if (tagged) report({ id: "photo-tags", label: `Tagged ${tagged} ${tagged === 1 ? "photo" : "photos"}`, status: "done" });
    } catch (err) {
      report({ id: "photo-tags", label: "Couldn't tag your photos", detail: friendlyError(err), status: "warn" });
    }
  }

  if (!logoPalette.length && !photoPalette.length) return { output: {} };
  return { output: { pixels: { version: PIXELS_VERSION, logoPalette, photoPalette }, photoInsights: images } satisfies VisualOutput };
}

export const visualStage: StageDefinition<VisualInput> = {
  id: "visual",
  label: "Looking at your logo and photos",
  reads: [],
  writes: [],
  async run(_model, input, { report }) {
    // Already done while the crawl was running.
    if (input.visualPre) return { patches: [], output: input.visualPre.output as Record<string, unknown> };
    const site = input.website;
    if (!site && !input.logoImage) return { patches: [], output: {} };
    const r = await analyseVisual(input.logoImage ?? site?.logoUrl, input.photoUrls ?? [], !!input.logoImage, report);
    return { patches: [], output: r.output as Record<string, unknown> };
  },
};
