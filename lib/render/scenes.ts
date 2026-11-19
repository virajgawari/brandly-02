/** Scenes: art-direction presets for AI photos. Each one is a prompt prefix; no extra model call. */
export const SCENES = [
  { id: "studio", label: "Clean studio", prefix: "Clean studio shot on a seamless backdrop, soft even light, subject centred, crisp detail." },
  { id: "daylight", label: "Natural daylight", prefix: "Natural window daylight, soft shadows, real-life setting, candid and unposed." },
  { id: "flatlay", label: "Flat lay", prefix: "Overhead flat lay on a textured surface, neatly arranged props, shallow shadows." },
  { id: "golden", label: "Golden hour", prefix: "Warm golden-hour light, gentle glow, relaxed outdoor mood." },
  { id: "moody", label: "Dark and moody", prefix: "Low-key lighting, deep shadows, rich contrast, dramatic but tasteful." },
  { id: "bold", label: "Bold colour", prefix: "Saturated single-colour backdrop, hard light, graphic and playful composition." },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const SCENE_TEXT_MAX = 200;

export function isSceneId(x: unknown): x is SceneId {
  return SCENES.some((s) => s.id === x);
}

/**
 * Image prompt for a scene. Free text describes what to show and replaces the post's own idea;
 * a preset only changes the look and keeps it. Returns the base prompt unchanged when neither is set.
 */
export function scenePrompt(base: string | undefined, scene?: unknown, text?: unknown): string | undefined {
  const free = typeof text === "string" ? text.trim().slice(0, SCENE_TEXT_MAX) : "";
  const preset = isSceneId(scene) ? SCENES.find((s) => s.id === scene)!.prefix : "";
  const subject = free || base?.trim() || "";
  if (!subject && !preset) return base;
  return [preset, subject].filter(Boolean).join(" ");
}
