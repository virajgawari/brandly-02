import { analyseImages, parseJSON } from "../../llm";
import { imagePixels } from "../../render/assets";
import { brandColours, kmeans, poolPalettes, PIXELS_VERSION, type Cluster } from "../../measure/pixels";
import { ImageTagsSchema, type ImageTags } from "../schemas";
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

const MAX_PHOTOS = 8;

const TAG_PROMPT = `Each image is a photo from one brand's website, numbered from 0 in the order given.
Return a JSON array, one object per image:
[{"index": 0, "subject": "what the photo shows, 3-6 words", "setting": "where, 1-3 words", "style": "photographic style, 2-4 words", "people": "none" | "one" | "group", "textOnImage": true|false, "productVisible": true|false}]`;

/** Measures colours from the logo and photo pixels and tags the photos with one vision call. */
export const visualStage: StageDefinition<IngestOutput> = {
  id: "visual",
  label: "Looking at your logo and photos",
  reads: [],
  writes: [],
  async run(_model, input, { report }) {
    const site = input.website;
    if (!site) return { patches: [], output: {} };

    const logo = site.logoUrl ? await imagePixels(site.logoUrl) : null;
    const logoPalette = logo ? brandColours(kmeans(logo.data, logo.channels, { k: 4 })) : [];
    if (logoPalette.length) report({ id: "logo-colours", label: "Measured colours from your logo", status: "done", swatches: logoPalette });

    const images: VisualImage[] = [];
    const jpegs: Buffer[] = [];
    const jpegOwner: number[] = [];
    const palettes: Cluster[][] = [];
    for (const url of (input.photoUrls ?? []).slice(0, MAX_PHOTOS)) {
      const px = await imagePixels(url);
      if (!px) continue;
      const clusters = kmeans(px.data, px.channels, { k: 5 });
      palettes.push(clusters);
      images.push({ url, colors: brandColours(clusters) });
      if (px.jpeg512) {
        jpegs.push(px.jpeg512);
        jpegOwner.push(images.length - 1);
      }
    }
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
        report({ id: "photo-tags", label: "Couldn't tag your photos", detail: err instanceof Error ? err.message : String(err), status: "warn" });
      }
    }

    if (!logoPalette.length && !photoPalette.length) return { patches: [], output: {} };
    return {
      patches: [],
      output: { pixels: { version: PIXELS_VERSION, logoPalette, photoPalette }, photoInsights: images } satisfies VisualOutput,
    };
  },
};
