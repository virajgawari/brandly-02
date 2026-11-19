import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ analyseImages: vi.fn(), parseJSON: (s: string) => JSON.parse(s) }));
vi.mock("@/lib/render/assets", () => ({ imagePixels: vi.fn() }));

import { emptyModel } from "@/lib/brand/model";
import { analyseImages } from "@/lib/llm";
import { imagePixels } from "@/lib/render/assets";
import { visualStage } from "@/lib/brand/stages/visual";

const model = () => emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-000000000003");
const ctx = () => ({ report: vi.fn() });
const solid = (r: number, g: number, b: number) => {
  const data = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) data.set([r, g, b, 255], i * 4);
  return { data, channels: 4 as const, jpeg512: Buffer.from("jpeg") };
};
const website = { url: "https://x.test/", logoUrl: "https://x.test/logo.png" } as never;

beforeEach(() => {
  vi.mocked(imagePixels).mockReset();
  vi.mocked(analyseImages).mockReset();
});

describe("visualStage", () => {
  it("measures the logo and photos and tags them", async () => {
    vi.mocked(imagePixels).mockImplementation(async (u: string) => (u.includes("logo") ? solid(200, 30, 30) : solid(30, 60, 200)));
    vi.mocked(analyseImages).mockResolvedValue(JSON.stringify([{ index: 0, subject: "coffee cup", setting: "cafe", style: "warm", people: "none", textOnImage: false, productVisible: true }]));
    const r = await visualStage.run(model(), { website, photoUrls: ["https://x.test/a.jpg"] }, ctx());
    const out = r.output as { pixels: { logoPalette: string[]; photoPalette: string[] }; photoInsights: { tags?: { subject: string } }[] };
    expect(out.pixels.logoPalette).toHaveLength(1);
    expect(out.pixels.photoPalette.length).toBeGreaterThan(0);
    expect(out.photoInsights[0].tags?.subject).toBe("coffee cup");
    expect(analyseImages).toHaveBeenCalledTimes(1);
  });
  it("keeps colours when tagging fails", async () => {
    vi.mocked(imagePixels).mockResolvedValue(solid(200, 30, 30));
    vi.mocked(analyseImages).mockRejectedValue(new Error("quota"));
    const c = ctx();
    const r = await visualStage.run(model(), { website, photoUrls: ["https://x.test/a.jpg"] }, c);
    expect((r.output as { pixels: { logoPalette: string[] } }).pixels.logoPalette).toHaveLength(1);
    expect(c.report).toHaveBeenCalledWith(expect.objectContaining({ id: "photo-tags", status: "warn" }));
  });
  it("does nothing without a website", async () => {
    const r = await visualStage.run(model(), {}, ctx());
    expect(r.output).toEqual({});
    expect(imagePixels).not.toHaveBeenCalled();
  });
});
