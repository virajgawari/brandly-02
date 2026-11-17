import { ABSTRACT, CONCRETE, MEASURE_UNITS_RE, logOdds, type Corpus, type LogOddsItem } from "./lexicon";
import { EMOJI_RE, HASHTAG_RE, STOPWORDS, isLatinWord, sentences, stripUrls, syllables, words } from "./tokenize";

export interface TextMeasures {
  /** Total words across all texts. Low values mean the other numbers are unreliable. */
  n: number;
  texts: number;
  sentenceLength: { mean: number; median: number; p90: number } | null;
  /** English only: null for short or mostly non-Latin text. */
  readability: { fleschReadingEase: number; fleschKincaidGrade: number } | null;
  pronouns: { firstSingular: number; firstPlural: number; second: number; third: number; youWeRatio: number | null } | null;
  emojiPer100Words: number;
  hashtagsPerText: number;
  exclamationPer100Words: number;
  questionShare: number;
  /** 0..100: higher = more specific, countable, tangible language. */
  concreteness: number;
  lexicon?: { over: LogOddsItem[]; under: LogOddsItem[] };
}

const FIRST_SING = new Set(["i", "me", "my", "mine", "myself", "i'm", "i've", "i'll", "i'd"]);
const FIRST_PLUR = new Set(["we", "us", "our", "ours", "ourselves", "we're", "we've", "we'll", "we'd"]);
const SECOND = new Set(["you", "your", "yours", "yourself", "yourselves", "you're", "you've", "you'll", "you'd"]);
const THIRD = new Set(["he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs", "it", "its", "himself", "herself", "themselves", "itself"]);

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

/** Site-chrome words and HTML-entity leftovers (x27 = apostrophe) that say nothing about voice. */
const CHROME = new Set(["submenu", "menu", "enter", "skip", "navigation", "cookie", "cookies", "login", "log", "sign", "cart", "javascript", "nbsp", "amp", "quot"]);
const isNoise = (w: string) => CHROME.has(w) || /^x[0-9a-f]{2,4}$/.test(w);

/** Word counts for the lexicon comparison (stopwords removed, digits-only tokens skipped). */
export function wordCounts(texts: string | string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of [texts].flat()) {
    for (const w of words(t)) {
      if (STOPWORDS.has(w) || isNoise(w) || /^\d+$/.test(w) || w.length < 2) continue;
      m.set(w, (m.get(w) ?? 0) + 1);
    }
  }
  return m;
}

/** Deterministic style measures. Pass one string per post/page so per-text rates make sense. */
export function measureText(input: string | string[], opts: { corpus?: Corpus | null } = {}): TextMeasures {
  const texts = [input].flat().filter((t) => t && t.trim());
  const all = texts.join("\n");
  const ws = words(all);
  const n = ws.length;
  const sents = texts.flatMap(sentences);
  const sentWords = sents.map((s) => words(s).length).filter((c) => c > 0).sort((a, b) => a - b);

  const base: TextMeasures = {
    n,
    texts: texts.length,
    sentenceLength: null,
    readability: null,
    pronouns: null,
    emojiPer100Words: 0,
    hashtagsPerText: 0,
    exclamationPer100Words: 0,
    questionShare: 0,
    concreteness: 50,
  };
  if (!n) return base;

  const per100 = (c: number) => r1((c / n) * 100);

  if (sentWords.length) {
    base.sentenceLength = {
      mean: r1(sentWords.reduce((a, b) => a + b, 0) / sentWords.length),
      median: r1(quantile(sentWords, 0.5)),
      p90: r1(quantile(sentWords, 0.9)),
    };
  }

  const latin = ws.filter(isLatinWord);
  if (n >= 30 && latin.length / n >= 0.6 && sentWords.length) {
    const syl = latin.reduce((a, w) => a + syllables(w), 0);
    const wps = latin.length / sentWords.length;
    const spw = syl / latin.length;
    base.readability = {
      fleschReadingEase: r1(206.835 - 1.015 * wps - 84.6 * spw),
      fleschKincaidGrade: r1(0.39 * wps + 11.8 * spw - 15.59),
    };
  }

  const count = (s: Set<string>) => ws.filter((w) => s.has(w)).length;
  const p = { a: count(FIRST_SING), b: count(FIRST_PLUR), c: count(SECOND), d: count(THIRD) };
  const pTotal = p.a + p.b + p.c + p.d;
  if (pTotal) {
    base.pronouns = {
      firstSingular: r3(p.a / pTotal),
      firstPlural: r3(p.b / pTotal),
      second: r3(p.c / pTotal),
      third: r3(p.d / pTotal),
      youWeRatio: p.b + p.a ? r3(p.c / (p.a + p.b)) : null,
    };
  }

  base.emojiPer100Words = per100((all.match(EMOJI_RE) ?? []).length);
  base.hashtagsPerText = texts.length ? r1(texts.reduce((a, t) => a + (t.match(HASHTAG_RE) ?? []).length, 0) / texts.length) : 0;
  base.exclamationPer100Words = per100((stripUrls(all).match(/!/g) ?? []).length);
  base.questionShare = sents.length ? r3(sents.filter((s) => /\?["')\]]*$/.test(s)).length / sents.length) : 0;

  const concrete = ws.filter((w) => CONCRETE.has(w)).length + (all.match(MEASURE_UNITS_RE) ?? []).length;  // bare numbers (nav, prices tables, years) don't count; numbers with a unit or currency do
  const abstract = ws.filter((w) => ABSTRACT.has(w)).length;
  base.concreteness = Math.round(((concrete + 1) / (concrete + abstract + 2)) * 100);

  if (opts.corpus) base.lexicon = logOdds(wordCounts(texts), opts.corpus.counts);
  return base;
}
