import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Corpus } from "./lexicon";

const cache = new Map<string, Corpus | null>();

async function read(name: string): Promise<Corpus | null> {
  if (cache.has(name)) return cache.get(name)!;
  try {
    const c = JSON.parse(await readFile(path.join(process.cwd(), "data", "corpus", `${name}.json`), "utf8")) as Corpus;
    cache.set(name, c);
    return c;
  } catch {
    cache.set(name, null);
    return null;
  }
}

/** The industry's word counts, else the all-industry baseline, else null (no corpus built yet). */
export async function loadCorpus(industry?: string): Promise<Corpus | null> {
  return (industry && (await read(industry))) || (await read("_all"));
}
