import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emptyModel } from "@/lib/brand/model";
import { runStages, STAGES } from "@/lib/brand/pipelines";
import type { StageDefinition } from "@/lib/brand/stages/types";

const original = { ...STAGES };
const fake = (id: string, run: StageDefinition["run"]) => {
  STAGES[id] = { id, label: id, reads: [], run } as unknown as StageDefinition;
};
afterEach(() => {
  for (const k of Object.keys(STAGES)) delete STAGES[k];
  Object.assign(STAGES, original);
  vi.useRealTimers();
});

describe("runStages groups", () => {
  it("runs a group together, shares carry only after the group, and calls onPartial per group", async () => {
    const seen: Record<string, unknown>[] = [];
    fake("a", async () => ({ patches: [], output: { fromA: 1 } }));
    fake("b", async (_m, input) => {
      seen.push({ ...input });
      return { patches: [], output: { fromB: 2 } };
    });
    fake("c", async (_m, input) => {
      seen.push({ ...input });
      return { patches: [], output: {} };
    });
    const partial = vi.fn();
    const res = await runStages([["a", "b"], "c"], emptyModel("X", "analyse" as never), {}, () => {}, partial);
    expect(seen[0]).not.toHaveProperty("fromA"); // b ran beside a, did not see it
    expect(seen[1]).toMatchObject({ fromA: 1, fromB: 2 }); // c saw both
    expect(partial).toHaveBeenCalledTimes(2);
    expect(res.output).toMatchObject({ fromA: 1, fromB: 2 });
  });

  it("skips a stage past its deadline and keeps the rest", async () => {
    vi.useFakeTimers();
    fake("rate", () => new Promise(() => {})); // never resolves
    fake("content-system", async () => ({ patches: [], output: { ok: true } }));
    const p = runStages([["rate", "content-system"]], emptyModel("X", "analyse" as never), {});
    await vi.advanceTimersByTimeAsync(26_000);
    const res = await p;
    expect(res.findings.some((f) => f.id === "rate-late" && f.status === "warn")).toBe(true);
    expect(res.output).toMatchObject({ ok: true });
  });
});
