import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));

import { emptyModel } from "@/lib/brand/model";
import { ExtractSchema } from "@/lib/brand/schemas";
import { generateStructured } from "@/lib/llm";
import { extractStage } from "@/lib/brand/stages/extract";

const model = () => emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-000000000005");
const website = { url: "https://x.test/", title: "", description: "", headings: [], copySample: "We sell coffee.", images: [], colors: [], fonts: [] } as never;
const pages = [{ url: "https://x.test/about", title: "About", description: "", headings: ["Our story"], text: "Roasted in Coorg.", images: [] }] as never;

beforeEach(() => vi.mocked(generateStructured).mockReset());

const evidenceOf = (r: Awaited<ReturnType<typeof extractStage.run>>, path: string) =>
  r.patches.map((p) => p.options.evidenceByPath?.[path]).find(Boolean);

describe("extractStage evidence citations", () => {
  it("lists numbered evidence in the prompt and maps cited refs to evidence ids", async () => {
    vi.mocked(generateStructured).mockResolvedValue(
      ExtractSchema.parse({ offering: "Coffee", promise: "Fresh", cites: { offering: ["E2"], promise: ["E9"] } })
    );
    const r = await extractStage.run(model(), { website, pages }, { report: vi.fn() });
    const prompt = vi.mocked(generateStructured).mock.calls[0][2] as string;
    expect(prompt).toContain("E1 = home page https://x.test/");
    expect(prompt).toContain("E2 = page /about");
    expect(evidenceOf(r, "strategy.offering")).toEqual(["website:https://x.test/about"]);
    // An unknown ref falls back to the home page.
    expect(evidenceOf(r, "strategy.promise")).toEqual(["website:https://x.test/"]);
    expect(evidenceOf(r, "personality.sincerity")).toEqual(["website:https://x.test/"]);
  });

  it("survives junk in cites", async () => {
    const parsed = ExtractSchema.parse({ cites: "nope" });
    expect(parsed.cites).toEqual({});
    vi.mocked(generateStructured).mockResolvedValue(parsed);
    const r = await extractStage.run(model(), { website }, { report: vi.fn() });
    expect(evidenceOf(r, "strategy.offering")).toEqual(["website:https://x.test/"]);
  });
});
