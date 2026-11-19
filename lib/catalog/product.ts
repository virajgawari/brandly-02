import { z } from "zod";

export const ProductInputSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.string().nullish(),
  url: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  imagePaths: z.array(z.string()).optional(),
  source: z.enum(["manual", "url", "photoshoot", "brand"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;

export interface Product {
  id: string;
  brandId: string;
  name: string;
  description: string;
  price: string | null;
  url: string | null;
  category: string | null;
  tags: string[];
  imagePaths: string[];
  source: "manual" | "url" | "photoshoot" | "brand";
  status: "active" | "archived";
  createdAt: string;
}

/** A row of the `products` table as Supabase returns it. */
export interface ProductRow {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  price: string | null;
  url: string | null;
  category: string | null;
  tags: string[];
  image_paths: string[];
  source: Product["source"];
  status: Product["status"];
  created_at: string;
}

export const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  brandId: r.brand_id,
  name: r.name,
  description: r.description,
  price: r.price,
  url: r.url,
  category: r.category,
  tags: r.tags,
  imagePaths: r.image_paths,
  source: r.source,
  status: r.status,
  createdAt: r.created_at,
});

export const MAX_PRODUCT_IMAGES = 6;
const trim = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Only http(s) URLs are kept. */
export function cleanUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Trims and bounds user or scraped input before it reaches the database. Returns null when there is no usable name. */
export function cleanProduct(input: ProductInput, ownPath: (p: string) => boolean = () => true) {
  const name = trim(input.name, 120);
  if (!name) return null;
  const tags = [...new Set((input.tags ?? []).map((t) => trim(t, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
  const imagePaths = [...new Set((input.imagePaths ?? []).filter((p) => !p.includes("..") && ownPath(p)))].slice(0, MAX_PRODUCT_IMAGES);
  return {
    name,
    description: trim(input.description, 1200),
    price: trim(input.price, 40) || null,
    url: cleanUrl(input.url),
    category: trim(input.category, 60) || null,
    tags,
    image_paths: imagePaths,
    source: input.source ?? "manual",
    status: input.status ?? "active",
  };
}

export interface ParsedProductPage {
  name: string;
  description: string;
  price: string | null;
  imageUrls: string[];
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : undefined;
}

function absolute(u: string, base: string): string | null {
  try {
    return cleanUrl(new URL(u, base).toString());
  } catch {
    return null;
  }
}

/** Finds a schema.org Product in JSON-LD blocks (also inside @graph arrays). */
function jsonLdProduct(html: string): Record<string, unknown> | undefined {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1]);
      const nodes: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
      for (const n of nodes) {
        const t = (n as { "@type"?: unknown })?.["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return n as Record<string, unknown>;
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return undefined;
}

/** Reads a product page's name, description, price and images from JSON-LD, falling back to Open Graph tags. */
export function parseProductPage(html: string, baseUrl: string): ParsedProductPage {
  const ld = jsonLdProduct(html);
  const offers = ld?.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const rawPrice = offer?.price ?? (offer as { lowPrice?: unknown } | undefined)?.lowPrice;
  const currency = typeof offer?.priceCurrency === "string" ? offer.priceCurrency : "";
  const price = rawPrice !== undefined && rawPrice !== null && String(rawPrice) !== "" ? `${currency} ${rawPrice}`.trim() : null;

  const ldImages = ld?.image;
  const imgList = (Array.isArray(ldImages) ? ldImages : ldImages ? [ldImages] : []).map((i) =>
    typeof i === "string" ? i : typeof (i as { url?: unknown })?.url === "string" ? (i as { url: string }).url : ""
  );
  const og = meta(html, "og:image");
  const imageUrls = [...new Set([...imgList, ...(og ? [og] : [])].map((u) => (u ? absolute(u, baseUrl) : null)).filter((u): u is string => !!u))].slice(0, MAX_PRODUCT_IMAGES);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    name: trim(typeof ld?.name === "string" ? ld.name : meta(html, "og:title") ?? (title ? decode(title) : ""), 120),
    description: trim(typeof ld?.description === "string" ? ld.description : meta(html, "og:description") ?? meta(html, "description"), 1200),
    price,
    imageUrls,
  };
}
