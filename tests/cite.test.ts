import { describe, expect, it } from "vitest";
import { citeOptions, evidenceRefs } from "@/lib/brand/cite";

const refs = evidenceRefs([
  { id: "website:https://x.test/", label: "home page" },
  { id: "website:https://x.test/about", label: "page /about" },
]);

describe("evidenceRefs", () => {
  it("numbers the evidence in the prompt block", () => {
    expect(refs.block).toContain("E1 = home page");
    expect(refs.block).toContain("E2 = page /about");
  });
  it("is empty when there is nothing to cite", () => expect(evidenceRefs([]).block).toBe(""));
  it("resolves refs, drops unknown ones and repeats", () => {
    expect(refs.resolve(["E2", "e2", "E9", "nonsense"])).toEqual(["website:https://x.test/about"]);
    expect(refs.resolve(undefined)).toEqual([]);
  });
});

describe("citeOptions", () => {
  it("uses cited evidence and falls back per field", () => {
    const out = citeOptions({ a: ["E2"], b: ["E9"] }, { a: ["x.a1", "x.a2"], b: ["x.b"], c: ["x.c"] }, refs.resolve, ["fallback"]);
    expect(out["x.a1"]).toEqual(["website:https://x.test/about"]);
    expect(out["x.a2"]).toEqual(["website:https://x.test/about"]);
    expect(out["x.b"]).toEqual(["fallback"]);
    expect(out["x.c"]).toEqual(["fallback"]);
  });
  it("accepts a per-field fallback", () => {
    expect(citeOptions({}, { a: ["p"] }, refs.resolve, { a: ["home"] })["p"]).toEqual(["home"]);
  });
});
