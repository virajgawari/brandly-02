import { describe, expect, it } from "vitest";
import { emptyModel } from "@/lib/brand/model";
import { businessLine } from "@/lib/brand/business";

describe("businessLine", () => {
  it("is empty when the brand has no business details", () => {
    expect(businessLine(emptyModel("A", "build"))).toBe("");
    expect(businessLine(undefined)).toBe("");
  });
  it("lists only the details that are filled in", () => {
    const m = emptyModel("A", "build");
    m.strategy.business = { phone: "+91 99999 00000", ctaLink: "https://a.example/book", ctaLabel: "Book now" };
    const line = businessLine(m);
    expect(line).toContain("https://a.example/book");
    expect(line).toContain("Book now");
    expect(line).toContain("+91 99999 00000");
    expect(line).not.toContain("address");
  });
});
