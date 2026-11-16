import type { BrandModel, FieldMeta, FieldMethod, FieldSource, ModelPatch } from "./model";
import type { Platform } from "@/lib/types";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Leaf paths are where the patch stops being a plain object (strings, numbers, arrays, tokens). */
function isLeaf(v: unknown): boolean {
  if (!isPlainObject(v)) return true;
  // Treat DTCG tokens as atomic values.
  return "$value" in v;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (isPlainObject(acc) ? acc[key] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

/** Flattens a patch into { "a.b.c": value } leaf entries. */
export function flattenPatch(patch: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isLeaf(v)) out[path] = v;
    else Object.assign(out, flattenPatch(v, path));
  }
  return out;
}

/** True when this path or any parent path is locked. */
export function isLocked(model: BrandModel, path: string): boolean {
  const parts = path.split(".");
  for (let i = parts.length; i > 0; i--) {
    if (model.meta[parts.slice(0, i).join(".")]?.locked) return true;
  }
  return false;
}

export interface MergeOptions {
  source: FieldSource;
  /** Default confidence for every field in the patch. */
  confidence: number;
  /** Per-path confidence overrides (e.g. CSS colours 0.95, guessed colours 0.4). */
  confidenceByPath?: Record<string, number>;
  /** Evidence ids each path rests on. */
  evidenceByPath?: Record<string, string[]>;
  /** Free-text reason per path, e.g. "AI guess". */
  noteByPath?: Record<string, string>;
  /** How the values were produced; defaults to "user" for user edits and "llm" otherwise. */
  method?: FieldMethod;
  methodByPath?: Record<string, FieldMethod>;
  /** Set when the values only apply to one platform. */
  platform?: Platform;
  /** Low/high bounds per path, in the field's own units. */
  intervalByPath?: Record<string, [number, number]>;
  /** User edits lock the fields they touch. */
  lock?: boolean;
}

export interface MergeResult {
  model: BrandModel;
  applied: string[];
  skippedLocked: string[];
  skippedLowerConfidence: string[];
}

/**
 * Lock-aware merge: never overwrite a locked field; only overwrite an existing
 * value when the new value is at least as confident, or comes from the user.
 */
export function mergePatch(model: BrandModel, patch: ModelPatch, opts: MergeOptions): MergeResult {
  const next = structuredClone(model) as BrandModel;
  const applied: string[] = [];
  const skippedLocked: string[] = [];
  const skippedLowerConfidence: string[] = [];
  const now = new Date().toISOString();

  for (const [path, value] of Object.entries(flattenPatch(patch))) {
    if (isEmptyValue(value)) continue;
    if (opts.source !== "user" && isLocked(next, path)) {
      skippedLocked.push(path);
      continue;
    }
    const conf = opts.confidenceByPath?.[path] ?? opts.confidence;
    const current = next.meta[path];
    if (opts.source !== "user" && current && current.confidence > conf) {
      skippedLowerConfidence.push(path);
      continue;
    }
    const previous = getPath(next, path);
    setPath(next as unknown as Record<string, unknown>, path, value);
    const meta: FieldMeta = {
      source: opts.source,
      method: opts.methodByPath?.[path] ?? opts.method ?? (opts.source === "user" ? "user" : "llm"),
      ...(opts.platform ? { platform: opts.platform } : {}),
      confidence: opts.source === "user" ? 1 : conf,
      ...(opts.intervalByPath?.[path] ? { interval: opts.intervalByPath[path] } : {}),
      locked: opts.lock ?? current?.locked ?? false,
      evidence: opts.evidenceByPath?.[path] ?? current?.evidence ?? [],
      ...((opts.noteByPath?.[path] ?? current?.note) ? { note: opts.noteByPath?.[path] ?? current?.note } : {}),
      // Keep the machine's last value; a user edit leaves it in place so the two can be compared.
      ...(opts.source === "user" ? (current?.value !== undefined ? { value: current.value } : current && current.source !== "user" ? { value: previous } : {}) : { value }),
      updatedAt: now,
    };
    next.meta[path] = meta;
    applied.push(path);
  }

  if (applied.length) {
    next.version = model.version + 1;
    next.updatedAt = now;
  }
  return { model: next, applied, skippedLocked, skippedLowerConfidence };
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function setLock(model: BrandModel, path: string, locked: boolean): BrandModel {
  const next = structuredClone(model) as BrandModel;
  const current = next.meta[path] ?? { source: "user" as const, confidence: 1, locked, evidence: [] };
  next.meta[path] = { ...current, locked };
  return next;
}

/** Paths whose confidence is below the threshold, used to ask "Check this" questions. */
export function lowConfidencePaths(model: BrandModel, threshold = 0.5): string[] {
  return Object.entries(model.meta)
    .filter(([, m]) => !m.locked && m.source !== "user" && m.confidence < threshold)
    .map(([p]) => p);
}

/** Confidence for a whole card (minimum of its fields). */
export function sectionConfidence(model: BrandModel, prefix: string): { confidence: number; source?: FieldSource; locked: boolean } {
  const entries = Object.entries(model.meta).filter(([p]) => p === prefix || p.startsWith(prefix + "."));
  if (!entries.length) return { confidence: 0, locked: false };
  const confidence = Math.min(...entries.map(([, m]) => m.confidence));
  const sources = entries.map(([, m]) => m.source);
  const source = sources.includes("user") ? "user" : sources[0];
  return { confidence, source, locked: entries.every(([, m]) => m.locked) || !!model.meta[prefix]?.locked };
}
