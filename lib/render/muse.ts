import "server-only";
import { persistRecord, startRecord } from "@/lib/llm-log";

// Meta's Muse Image through the Meta Model API (https://dev.meta.ai/docs/image-generation).
// Never throws: a missing key, a safety block or an outage returns undefined so callers can fall back.

const DEFAULT_BASE = "https://api.meta.ai/v1";
const DEFAULT_MODEL = "muse-image-1.0";
const TIMEOUT_MS = 45_000;
const COST_USD = 0.01;

export type MuseAspect = "4:5" | "1:1" | "9:16";

const SIZES: Record<MuseAspect, string> = { "4:5": "1024x1280", "1:1": "1024x1024", "9:16": "1024x1792" };

export function museEnabled(): boolean {
  return !!process.env.MUSE_API_KEY?.trim();
}

export interface MuseRequest {
  prompt: string;
  aspect: MuseAspect;
  /** Data URLs of photos the result should be based on (e.g. the real product). */
  references?: string[];
}

/** Builds the endpoint and JSON body. Exported for tests. */
export function museBody(req: MuseRequest): { path: string; body: Record<string, unknown> } {
  const base = {
    model: process.env.MUSE_MODEL?.trim() || DEFAULT_MODEL,
    prompt: req.prompt,
    size: SIZES[req.aspect],
    output_format: "jpeg",
    reasoning_strength: "low",
    tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
  };
  if (req.references?.length) {
    return {
      path: "/images/edits",
      body: { ...base, images: req.references.slice(0, 10).map((image_url) => ({ image_url })) },
    };
  }
  return { path: "/images/generations", body: { ...base, n: 1, response_format: "b64_json" } };
}

async function callOnce(url: string, body: unknown, key: string): Promise<{ status: number; json: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

/** Generates (or, with references, edits) one image. Returns JPEG bytes, or undefined on any failure. */
export async function museImage(req: MuseRequest): Promise<Buffer | undefined> {
  const key = process.env.MUSE_API_KEY?.trim();
  if (!key || !req.prompt) return undefined;
  const { path, body } = museBody(req);
  const url = `${(process.env.MUSE_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "")}${path}`;

  const rec = startRecord("image", { prompt: req.prompt, aspect: req.aspect, references: req.references?.length ?? 0 });
  rec.provider = "meta";
  rec.model = body.model as string;
  const started = Date.now();
  try {
    let last: { status: number; json: any } | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      rec.attempts = attempt + 1;
      try {
        last = await callOnce(url, body, key);
      } catch (err) {
        last = { status: 0, json: { error: { message: err instanceof Error ? err.message : String(err) } } };
      }
      if (last.status !== 503 && last.status !== 0) break; // only outages are worth a second try
    }
    const b64 = last?.json?.data?.[0]?.b64_json;
    if (last && last.status < 400 && typeof b64 === "string" && b64) {
      rec.parsed_ok = true;
      rec.output = "image";
      return Buffer.from(b64, "base64");
    }
    const msg = last?.json?.error?.message ?? last?.json?.message ?? "no image returned";
    const code = last?.json?.error?.code ?? last?.json?.code;
    rec.error = `${last?.status ?? 0} ${code ?? ""} ${msg}`.trim().slice(0, 300);
    console.warn("[muse] generation failed:", rec.error);
    return undefined;
  } finally {
    rec.latency_ms = Date.now() - started;
    if (rec.parsed_ok) rec.cost_usd = COST_USD;
    void persistRecord(rec);
  }
}
