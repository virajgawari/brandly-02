import { describe, expect, it } from "vitest";
import { ConfigPatchSchema, isAdminRole } from "@/lib/agent/config";

describe("ConfigPatchSchema", () => {
  it("accepts a partial change", () => {
    expect(ConfigPatchSchema.safeParse({ min_sample: 6 }).success).toBe(true);
  });
  it("rejects empty, unknown and out-of-range values", () => {
    expect(ConfigPatchSchema.safeParse({}).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ workspace_id: "x" }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ min_sample: 1 }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ engagement_weight: 2 }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ window_days: 30.5 }).success).toBe(false);
  });
});

describe("isAdminRole", () => {
  it("lets only owners and admins in", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("editor")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
