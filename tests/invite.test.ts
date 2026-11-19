import { describe, expect, it } from "vitest";
import { inviteLink, isInviteToken, parseInvite } from "@/lib/team/invite";

describe("parseInvite", () => {
  it("normalises email and defaults the role to editor", () => {
    expect(parseInvite({ email: "  Ana@Example.COM " })).toEqual({ email: "ana@example.com", role: "editor" });
  });
  it("rejects bad emails and roles", () => {
    expect("error" in parseInvite({ email: "nope" })).toBe(true);
    expect("error" in parseInvite({ email: "a@b.co", role: "owner" })).toBe(true);
    expect("error" in parseInvite({})).toBe(true);
  });
});

describe("invite link and token", () => {
  it("builds a link without double slashes", () => {
    expect(inviteLink("https://app.test/", "abc")).toBe("https://app.test/invite/abc");
  });
  it("accepts only 48 hex characters", () => {
    expect(isInviteToken("a".repeat(48))).toBe(true);
    expect(isInviteToken("a".repeat(47))).toBe(false);
    expect(isInviteToken("g".repeat(48))).toBe(false);
    expect(isInviteToken(undefined)).toBe(false);
  });
});
