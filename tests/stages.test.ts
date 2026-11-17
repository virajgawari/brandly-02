import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));
vi.mock("@/lib/measure/corpus", () => ({ loadCorpus: vi.fn(async () => null) }));

import { emptyModel } from "@/lib/brand/model";
import { paragraphs } from "@/lib/measure/paragraphs";
import { generateStructured } from "@/lib/llm";
import { measureStage } from "@/lib/brand/stages/measure";
import { rateStage } from "@/lib/brand/stages/rate";

const model = () => emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-000000000002");
const sentence = (i: number) => `We roast small batches number ${i} every single week and ship them to your door fresh and fast.`;
const pageText = (n: number) => Array.from({ length: n }, (_, i) => sentence(i)).join(" ");
const page = (n: number, url = "https://x.test/") => ({ url, title: "", description: "", headings: [], text: pageText(n), images: [] });
const ctx = () => ({ report: vi.fn() });

describe("paragraphs", () => {
  it("builds 20 to 80 word chunks from whole sentences", () => {
    const ps = paragraphs([{ text: pageText(12) }]);
    expect(ps.length).toBeGreaterThan(2);
    for (const p of ps) expect(p.split(/\s+/).length).toBeGreaterThanOrEqual(20);
    for (const p of ps) expect(p.split(/\s+/).length).toBeLessThanOrEqual(80);
  });
});

describe("measureStage", () => {
  it("outputs textMeasures and writes no fields", async () => {
    const r = await measureStage.run(model(), { sitePages: [page(20)] }, ctx());
    expect(r.patches).toEqual([]);
    expect(r.output?.textMeasures).toMatchObject({ texts: 1 });
  });
  it("measures each long page and skips short ones", async () => {
    const r = await measureStage.run(model(), { sitePages: [page(20, "https://x.test/a"), page(2, "https://x.test/b"), page(20, "https://x.test/c")] }, ctx());
    const pm = r.output?.pageMeasures as { url: string; version: string }[];
    expect(pm.map((x) => x.url)).toEqual(["https://x.test/a", "https://x.test/c"]);
    expect(pm[0].version).toBeTruthy();
  });
  it("skips quietly when there is too little text", async () => {
    const c = ctx();
    const r = await measureStage.run(model(), { sitePages: [page(1)] }, c);
    expect(r.output).toEqual({});
    expect(c.report).toHaveBeenCalledWith(expect.objectContaining({ status: "warn" }));
  });
});

describe("rateStage", () => {
  beforeEach(() => vi.mocked(generateStructured).mockReset());

  it("emits rated patches only for facets with enough scored texts", async () => {
    vi.mocked(generateStructured).mockImplementation(async (_s, _sys, prompt) => {
      const ids = [...String(prompt).matchAll(/<text id="(\d+)">/g)].map((m) => Number(m[1]));
      return { ratings: ids.map((id) => ({ id, sincerity: { score: 70, quote: "small batches" }, ruggedness: id === ids[0] ? { score: 40, quote: "small batches" } : undefined })) } as never;
    });
    const r = await rateStage.run(model(), { sitePages: [page(20)], rateOptions: { delayMs: 0 } }, ctx());
    const o = r.patches[0]?.options;
    expect(o?.method).toBe("rated");
    expect(o?.intervalByPath?.["personality.sincerity"]).toBeDefined();
    expect(Object.keys(o?.confidenceByPath ?? {})).not.toContain("personality.ruggedness");
    expect(r.patches[0].patch.personality?.sincerity).toBe(70);
  });

  it("keeps the first guess when the judge fails", async () => {
    vi.mocked(generateStructured).mockResolvedValue({} as never); // a reply with no ratings counts as a failed batch
    const c = ctx();
    const r = await rateStage.run(model(), { sitePages: [page(20)], rateOptions: { delayMs: 0 } }, c);
    expect(r.patches).toEqual([]);
    expect(c.report).toHaveBeenCalledWith(expect.objectContaining({ status: "warn" }));
  });
});
