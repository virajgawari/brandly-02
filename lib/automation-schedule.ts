import type { TriggerConfig } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** True when `tz` is a real IANA timezone name. */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at instant `at`: local wall time minus UTC. */
function offsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` reads y-m-d h:m (DST-safe). */
function zonedToUtc(tz: string, y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, mo, d, h, mi);
  let utc = guess - offsetMs(tz, new Date(guess));
  utc = guess - offsetMs(tz, new Date(utc)); // second pass settles DST edges
  return new Date(utc);
}

/** When a rule should next run after `from`. Daily/weekly rules fire at `timeOfDay` in the workspace timezone (default UTC). */
export function nextRunAfter(trigger: TriggerConfig, from = new Date(), tz = "UTC"): Date {
  if (trigger.type === "rss") return new Date(from.getTime() + Math.max(1, trigger.checkIntervalHours || 6) * HOUR);
  if (trigger.type === "product_update") return new Date(from.getTime() + DAY);
  const zone = isValidTimezone(tz) ? tz : "UTC";
  const [h, m] = (trigger.timeOfDay || "09:00").split(":").map(Number);
  // Local calendar date "today" in the workspace timezone, then move forward intervalDays.
  const local = new Date(from.getTime() + offsetMs(zone, from));
  const next = zonedToUtc(zone, local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + Math.max(1, trigger.intervalDays || 1), h || 0, m || 0);
  return next;
}
