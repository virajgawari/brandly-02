import { describe, expect, it } from "vitest";
import { ManualMetricsSchema } from "@/lib/agent/metrics";

describe("ManualMetricsSchema", () => {
  it("accepts reach plus an engagement count", () => {
    expect(ManualMetricsSchema.safeParse({ platform: "instagram", reach: 500, likes: 20 }).success).toBe(true);
  });
  it("needs reach or impressions", () => {
    expect(ManualMetricsSchema.safeParse({ platform: "instagram", likes: 20 }).success).toBe(false);
  });
  it("needs at least one engagement count", () => {
    expect(ManualMetricsSchema.safeParse({ platform: "instagram", reach: 500 }).success).toBe(false);
  });
  it("rejects negatives, unknown platforms and unknown keys", () => {
    expect(ManualMetricsSchema.safeParse({ platform: "instagram", reach: 500, likes: -1 }).success).toBe(false);
    expect(ManualMetricsSchema.safeParse({ platform: "tiktok", reach: 500, likes: 1 }).success).toBe(false);
    expect(ManualMetricsSchema.safeParse({ platform: "instagram", reach: 500, likes: 1, workspace_id: "x" }).success).toBe(false);
  });
});
