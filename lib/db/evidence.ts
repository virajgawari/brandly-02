import "server-only";
import type { PageEvidence } from "@/lib/web";
import type { Session } from "./session";

/** Replaces the brand's stored website pages with the latest crawl. The brand row must already exist. */
export async function saveWebsiteEvidence(s: Session, brandId: string, pages: PageEvidence[]) {
  const { error: delErr } = await s.db.from("brand_evidence").delete().eq("brand_id", brandId).eq("source", "website");
  if (delErr) throw delErr;
  if (!pages.length) return 0;
  const rows = pages.map((p) => ({
    brand_id: brandId,
    workspace_id: s.workspaceId,
    source: "website",
    url: p.url,
    summary: [p.title, p.description].filter(Boolean).join(" — ") || null,
    raw: { title: p.title, description: p.description, headings: p.headings, text: p.text, images: p.images },
  }));
  const { error } = await s.db.from("brand_evidence").insert(rows);
  if (error) throw error;
  return rows.length;
}
