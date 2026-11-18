import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));

import { emptyModel } from "@/lib/brand/model";
import { ContentSystemSchema } from "@/lib/brand/schemas";
import { generateStructured } from "@/lib/llm";
import { contentSystemStage } from "@/lib/brand/stages/content-system";

beforeEach(() => vi.mocked(generateStructured).mockReset());

describe("contentSystemStage", () => {
  it("feeds measured facts into the prompt and cites evidence", async () => {
    const m = emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-000000000006");
    m.evidence = [{ id: "website:https://x.test/", source: "website", url: "https://x.test/", summary: "", capturedAt: "" }];
    m.measures = {
      version: "t",
      at: "",
      text: { lexicon: { over: [{ word: "single-origin" }] } } as never,
      contradictions: [{ id: "c", path: "voice.tone.formal_casual", text: "Copy reads more formal than the profile." }],
      pixels: { version: "t", logoPalette: [], photoPalette: ["#EDDDC5"] },
    };
    vi.mocked(generateStructured).mockResolvedValue(ContentSystemSchema.parse({ pillars: ["Origin stories"], cites: { pillars: ["E1"] } }));
    const photoInsights = [{ url: "u", colors: [], tags: { index: 0, subject: "pour-over cup", setting: "cafe", style: "", people: "none" as const, textOnImage: false, productVisible: true, productName: "" } }];
    const r = await contentSystemStage.run(m, { photoInsights }, { report: vi.fn() });
    const prompt = vi.mocked(generateStructured).mock.calls[0][2] as string;
    expect(prompt).toContain("single-origin");
    expect(prompt).toContain("more formal than the profile");
    expect(prompt).toContain("pour-over cup");
    expect(prompt).toContain("#EDDDC5");
    expect(prompt).toContain("E1 = page https://x.test/");
    const opts = r.patches[0].options;
    expect(opts.evidenceByPath!["content.pillars"]).toEqual(["website:https://x.test/"]);
    expect(r.patches[0].patch).not.toHaveProperty("content.cites");
    expect(Object.keys(r.patches[0].patch.content as object)).not.toContain("cites");
  });
});
