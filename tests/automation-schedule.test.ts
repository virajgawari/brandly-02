import { describe, expect, it } from "vitest";
import { isValidTimezone, nextRunAfter } from "@/lib/automation-schedule";
import type { TriggerConfig } from "@/lib/types";

const daily = (timeOfDay: string, intervalDays = 1) => ({ type: "schedule", timeOfDay, intervalDays, topic: "t" }) as unknown as TriggerConfig;

describe("nextRunAfter timezone", () => {
  it("defaults to UTC", () => {
    expect(nextRunAfter(daily("09:00"), new Date("2026-03-01T10:00:00Z")).toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("fires at local time in Asia/Kolkata (UTC+5:30)", () => {
    // 09:00 IST = 03:30 UTC
    expect(nextRunAfter(daily("09:00"), new Date("2026-03-01T10:00:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-03-02T03:30:00.000Z");
  });

  it("handles DST in America/New_York", () => {
    // 2026-03-08 is the spring-forward day. From Mar 7 09:00 EST, next 09:00 local is Mar 8 09:00 EDT = 13:00 UTC.
    expect(nextRunAfter(daily("09:00"), new Date("2026-03-07T14:00:00Z"), "America/New_York").toISOString()).toBe("2026-03-08T13:00:00.000Z");
    // Winter: 09:00 EST = 14:00 UTC
    expect(nextRunAfter(daily("09:00"), new Date("2026-01-10T20:00:00Z"), "America/New_York").toISOString()).toBe("2026-01-11T14:00:00.000Z");
  });

  it("spring-forward gap: 02:30 does not exist on 2026-03-08 in New York, so the run still happens once that day", () => {
    const next = nextRunAfter(daily("02:30"), new Date("2026-03-07T12:00:00Z"), "America/New_York");
    // Must land on Mar 8 (not skipped to Mar 9), within the 02:00-04:00 local window.
    expect(next.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-03-08T06:00:00Z"));
    expect(next.getTime()).toBeLessThanOrEqual(Date.parse("2026-03-08T08:00:00Z"));
  });

  it("fall-back overlap: 01:30 on 2026-11-01 happens once, and the next day is exactly one run later", () => {
    const first = nextRunAfter(daily("01:30"), new Date("2026-10-31T12:00:00Z"), "America/New_York");
    // 01:30 occurs twice (EDT then EST); either instant is a valid single run on Nov 1.
    expect([Date.parse("2026-11-01T05:30:00Z"), Date.parse("2026-11-01T06:30:00Z")]).toContain(first.getTime());
    const second = nextRunAfter(daily("01:30"), first, "America/New_York");
    expect(second.toISOString()).toBe("2026-11-02T06:30:00.000Z"); // 01:30 EST, next calendar day
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(nextRunAfter(daily("09:00"), new Date("2026-03-01T10:00:00Z"), "Nope/Zone").toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("validates timezone names", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
    expect(isValidTimezone(5)).toBe(false);
  });
});
