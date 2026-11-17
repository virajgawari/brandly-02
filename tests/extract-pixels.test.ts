import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));

import { emptyModel } from "@/lib/brand/model";
import { ExtractSchema } from "@/lib/brand/schemas";
import { generateStructured } from "@/lib/llm";
import { extractStage } from "@/lib/brand/stages/extract";

const model = () => emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-000000000004");
const website = { url: "https://x.test/", title: "", description: "", headings: [], copySample: "", images: [], colors: ["#112233"], fonts: [] } as never;

beforeEach(() => vi.mocked(generateStructured).mockReset());

describe("extractStage with logo pixels", () => {
  it("puts logo colours in the prompt and notes a logo match", async () => {
    vi.mocked(generateStructured).mockResolvedValue(ExtractSchema.parse({ colors: { primary: "#D02E2F", secondary: "#112233", accent: "", neutral: "#FFFFFF" } }));
    const r = await extractStage.run(model(), { website, pixels: { logoPalette: ["#D02E2E"], photoPalette: ["#EDDDC5"] } }, { report: vi.fn() });
    const prompt = vi.mocked(generateStructured).mock.calls[0][2] as string;
    expect(prompt).toContain("#D02E2E");
    expect(prompt).toContain("Photo palette");
    const opts = r.patches.map((p) => p.options).find((o) => o.confidenceByPath?.["expression.tokens.color.primary"] !== undefined)!;
    expect(opts.confidenceByPath!["expression.tokens.color.primary"]).toBe(0.95);
    expect(opts.noteByPath!["expression.tokens.color.primary"]).toBe("measured from your logo");
    expect(opts.noteByPath!["expression.tokens.color.secondary"]).toBe("website / image colours");
  });
});
