import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm-log", () => ({
  startRecord: () => ({ id: "x", feature: "image", attempts: 0 }),
  persistRecord: vi.fn(),
}));

import { museBody, museEnabled, museImage } from "@/lib/render/muse";

const ok = (b64 = Buffer.from("jpg").toString("base64")) => new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 });
const fail = (status: number, error: object = {}) => new Response(JSON.stringify({ error }), { status });

beforeEach(() => {
  process.env.MUSE_API_KEY = "test-key";
  delete process.env.MUSE_BASE_URL;
  delete process.env.MUSE_MODEL;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.MUSE_API_KEY;
});

describe("museBody", () => {
  it("uses generations with the right size and tools off", () => {
    const { path, body } = museBody({ prompt: "p", aspect: "4:5" });
    expect(path).toBe("/images/generations");
    expect(body).toMatchObject({ model: "muse-image-1.0", size: "1024x1280", response_format: "b64_json", n: 1 });
    expect(body.tool_enablement).toEqual({ enable_image_search: false, enable_web_search: false, enable_shell: false });
    expect(museBody({ prompt: "p", aspect: "1:1" }).body.size).toBe("1024x1024");
  });

  it("uses edits when references are given", () => {
    const { path, body } = museBody({ prompt: "p", aspect: "1:1", references: ["data:image/jpeg;base64,AA"] });
    expect(path).toBe("/images/edits");
    expect(body.images).toEqual([{ image_url: "data:image/jpeg;base64,AA" }]);
  });
});

describe("museImage", () => {
  it("is disabled without a key", async () => {
    delete process.env.MUSE_API_KEY;
    expect(museEnabled()).toBe(false);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await museImage({ prompt: "p", aspect: "4:5" })).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the bearer key and returns the decoded bytes", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", f);
    const buf = await museImage({ prompt: "p", aspect: "4:5" });
    expect(buf?.toString()).toBe("jpg");
    expect(f.mock.calls[0][0]).toBe("https://api.meta.ai/v1/images/generations");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  });

  it("retries once on 503", async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", f);
    expect(await museImage({ prompt: "p", aspect: "1:1" })).toBeDefined();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("returns undefined without retrying on a policy block", async () => {
    const f = vi.fn().mockResolvedValue(fail(400, { code: "content_policy_violation", message: "blocked" }));
    vi.stubGlobal("fetch", f);
    expect(await museImage({ prompt: "p", aspect: "1:1" })).toBeUndefined();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
