import { evidenceId, MODEL_SCHEMA_VERSION, type BrandModel, type FieldMeta, type Personality, type Tone } from "./model";
import { signedToTone, unitToPct, TONE_KEYS } from "./scale";

type LegacyMeta = Omit<FieldMeta, "evidence"> & { evidence?: string | string[] };

/**
 * Brings a saved Brand Model up to the current shape. Safe to call on any model,
 * any number of times: a model already at the current version is returned as is.
 *
 * v1 → v2: personality 0–1 → 0–100, tone -1..1 → 0–100, free-text field evidence
 * → `note` with an (empty) evidence id list, evidence items get ids.
 */
export function upgradeModel(model: BrandModel): BrandModel {
  if ((model.schemaVersion ?? 1) >= MODEL_SCHEMA_VERSION) return model;
  const m = structuredClone(model) as BrandModel;

  m.personality = Object.fromEntries(Object.entries(m.personality).map(([k, v]) => [k, unitToPct(v)])) as unknown as Personality;
  const tone = { ...m.voice.tone } as Tone;
  for (const k of TONE_KEYS) tone[k] = signedToTone(tone[k]);
  m.voice = { ...m.voice, tone };

  m.evidence = (m.evidence ?? []).map((e) => ({ ...e, id: e.id ?? evidenceId(e.source, e.url) }));

  const meta: Record<string, FieldMeta> = {};
  for (const [path, raw] of Object.entries((m.meta ?? {}) as Record<string, LegacyMeta>)) {
    const { evidence, ...rest } = raw;
    const next: FieldMeta = { ...rest, evidence: Array.isArray(evidence) ? evidence : [] };
    if (typeof evidence === "string" && evidence) next.note = evidence;
    // Until a real measurement supplies an interval, widen it as confidence drops.
    if (path.startsWith("personality.") && !next.interval) {
      const v = (m.personality as unknown as Record<string, number>)[path.split(".")[1]];
      if (typeof v === "number") {
        const half = Math.round(((1 - next.confidence) * 50) / 2);
        next.interval = [Math.max(0, v - half), Math.min(100, v + half)];
      }
    }
    meta[path] = next;
  }
  m.meta = meta;
  m.schemaVersion = MODEL_SCHEMA_VERSION;
  return m;
}
