import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));

import { backoffMs, isTransientFailure } from "@/lib/publish";

describe("publish retry classification", () => {
  it("treats 429/5xx and network errors as transient", () => {
    expect(isTransientFailure([{ platform: "x", ok: false, error: "Postiz 502: Bad Gateway" }])).toBe(true);
    expect(isTransientFailure([{ platform: "x", ok: false, error: "Postiz 429: slow down" }])).toBe(true);
    expect(isTransientFailure([{ platform: "x", ok: false, error: "fetch failed" }])).toBe(true);
  });

  it("does not retry permanent failures", () => {
    expect(isTransientFailure([{ platform: "x", ok: false, error: "Postiz 400: bad request" }])).toBe(false);
    expect(isTransientFailure([{ platform: "instagram", ok: false, error: "Instagram needs an image (mediaUrl)" }])).toBe(false);
    expect(isTransientFailure([{ platform: "x", ok: false, error: "Postiz 502" }, { platform: "y", ok: false, error: "Postiz 400" }])).toBe(false);
    expect(isTransientFailure([])).toBe(false);
  });

  it("backs off exponentially, capped at one hour", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
