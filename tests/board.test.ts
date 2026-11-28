import { describe, expect, it } from "vitest";
import { boardFromFindings } from "@/lib/brand/board";

describe("boardFromFindings", () => {
  it("fills in as findings arrive", () => {
    expect(boardFromFindings([{ id: "site", label: "Reading", status: "info" }])).toMatchObject({ name: undefined, swatches: [], photos: [], status: "Reading" });
    const b = boardFromFindings([
      { id: "site", label: "Read x.com", detail: "X Coffee", status: "done" },
      { id: "logo", label: "No logo", status: "warn" },
      { id: "colors", label: "c", status: "done", swatches: ["#111111"] },
      { id: "fonts", label: "f", status: "done", fonts: ["Marfa"] },
      { id: "photos", label: "p", status: "done", image: "a", images: ["a", "b"] },
      { id: "synth", label: "ready", status: "done", detail: "Coffee roaster" },
    ]);
    expect(b).toMatchObject({ name: "X Coffee", logoMissing: true, swatches: ["#111111"], fonts: ["Marfa"], photos: ["a", "b"], oneLiner: "Coffee roaster" });
  });
});
