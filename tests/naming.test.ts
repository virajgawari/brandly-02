import { describe, expect, it } from "vitest";
import { brandNameFromTitle, nameFromUrl } from "@/lib/brand/naming";

describe("nameFromUrl", () => {
  it("uses the first host label", () => {
    expect(nameFromUrl("https://www.bluetokaicoffee.com/x")).toBe("Bluetokaicoffee");
    expect(nameFromUrl("chaipoint.com")).toBe("Chaipoint");
    expect(nameFromUrl("")).toBe("");
  });
});

describe("brandNameFromTitle", () => {
  it("prefers the segment that matches the hostname", () => {
    expect(brandNameFromTitle("Buy Coffee Online | Blue Tokai Coffee Roasters", "bluetokaicoffee.com")).toBe("Blue Tokai Coffee Roasters");
    expect(brandNameFromTitle("Blue Tokai Coffee Roasters | Buy Coffee Online", "https://bluetokaicoffee.com")).toBe("Blue Tokai Coffee Roasters");
  });
  it("skips generic segments when nothing matches the host", () => {
    expect(brandNameFromTitle("Home - Acme Candles", "https://shop.example.org")).toBe("Acme Candles");
  });
  it("falls back to the host name for empty or generic titles", () => {
    expect(brandNameFromTitle("", "chaipoint.com")).toBe("Chaipoint");
    expect(brandNameFromTitle("Home", "chaipoint.com")).toBe("Chaipoint");
    expect(brandNameFromTitle(undefined, "chaipoint.com")).toBe("Chaipoint");
  });
  it("keeps hyphens inside a name", () => {
    expect(brandNameFromTitle("Coca-Cola India", "coca-cola.in")).toBe("Coca-Cola India");
  });
});
