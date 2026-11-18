import "server-only";
import type { BrandModel } from "./model";
import { buildLogoPrompt, LOGO_VARIANTS } from "./logo-prompt";
import { cleanLogo } from "./logo-clean";
import { museEnabled, museImage } from "@/lib/render/muse";
import { llmScope } from "@/lib/db/llm-scope";

/** Makes up to 3 logo options as transparent PNG data URIs. Returns [] when Muse is off or every call fails. */
export async function generateLogos(model: BrandModel, count = LOGO_VARIANTS): Promise<string[]> {
  if (!museEnabled()) return [];
  const made = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      try {
        const raw = await llmScope("logo", { brandId: model.id }, () => museImage({ prompt: buildLogoPrompt(model, i), aspect: "1:1" }));
        if (!raw) return undefined;
        const png = await cleanLogo(raw);
        return `data:image/png;base64,${png.toString("base64")}`;
      } catch (err) {
        console.warn("[logo] option failed:", err instanceof Error ? err.message : err);
        return undefined;
      }
    })
  );
  return made.filter((x): x is string => !!x);
}
