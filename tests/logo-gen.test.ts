import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/llm-scope", () => ({ llmScope: (_f: string, _o: unknown, fn: () => unknown) => fn() }));
const muse = vi.hoisted(() => ({ museEnabled: vi.fn(), museImage: vi.fn() }));
vi.mock("@/lib/render/muse", () => muse);

import { emptyModel } from "@/lib/brand/model";
import { generateLogos } from "@/lib/brand/logo-gen";

const jpeg = () => sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();

beforeEach(() => {
  muse.museEnabled.mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const model = () => emptyModel("Test Co", "analyse", "00000000-0000-4000-8000-00000000000a");

describe("generateLogos", () => {
  it("returns nothing when Muse is off", async () => {
    muse.museEnabled.mockReturnValue(false);
    expect(await generateLogos(model())).toEqual([]);
    expect(muse.museImage).not.toHaveBeenCalled();
  });
  it("keeps the options that worked and drops failures", async () => {
    const buf = await jpeg();
    muse.museImage.mockReset().mockResolvedValueOnce(buf).mockResolvedValueOnce(undefined).mockResolvedValueOnce(Buffer.from("not an image"));
    const out = await generateLogos(model());
    expect(muse.museImage).toHaveBeenCalledTimes(3);
    expect(out.length).toBe(1);
    expect(out[0]).toMatch(/^data:image\/png;base64,/);
  });
});
