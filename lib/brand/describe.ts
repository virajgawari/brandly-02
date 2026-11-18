// Shared by the website `visual` stage and the upload "describe" route:
// one vision prompt that tags photos and suggests product names.
import type { BrandPhoto } from "./model";
import type { ImageTags } from "./schemas";

export const TAG_PROMPT = `Each image is a photo from one brand, numbered from 0 in the order given.
Return a JSON array, one object per image:
[{"index": 0, "subject": "what the photo shows, 3-6 words", "setting": "where, 1-3 words", "style": "photographic style, 2-4 words", "people": "none" | "one" | "group", "textOnImage": true|false, "productVisible": true|false, "productName": "plain name of the main product, max 5 words, or empty if no single product is shown"}]
Name only what you can see. Do not invent brand names, models or sizes.`;

/** A photo that clearly shows a product is filed under Products. */
export function roleFromTags(tags?: ImageTags): BrandPhoto["role"] {
  return tags?.productVisible && !!tags.productName ? "product" : undefined;
}

/** Product details taken from vision tags, or undefined when there is no usable name. */
export function productFromTags(tags?: ImageTags): BrandPhoto["product"] {
  const name = tags?.productName?.trim();
  return name ? { name } : undefined;
}
