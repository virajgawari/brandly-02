// Deterministic text helpers. English-first; non-Latin text is counted but not syllabified.

export const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
export const HASHTAG_RE = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
export const MENTION_RE = /(?:^|\s)@[\w.]+/g;
export const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|st|no|approx|inc|ltd|co)\.$/i;

/** Text with URLs removed (they distort word and sentence counts). */
export const stripUrls = (t: string) => t.replace(URL_RE, " ");

/** Splits into sentences on . ! ? … and line breaks, keeping common abbreviations together. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const block of stripUrls(text).split(/\n+/)) {
    let cur = "";
    for (const piece of block.split(/(?<=[.!?…])\s+/)) {
      cur = cur ? `${cur} ${piece}` : piece;
      if (ABBREV.test(cur.trim())) continue;
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Lower-case words (letters, digits, inner apostrophes). Hashtags and mentions are excluded. */
export function words(text: string): string[] {
  const clean = stripUrls(text).replace(HASHTAG_RE, " ").replace(MENTION_RE, " ");
  // \p{M} keeps combining vowel signs (Devanagari matras) inside the word.
  return (clean.toLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? []).map((w) => w.replace(/’/g, "'"));
}

export const isLatinWord = (w: string) => /^[\p{Script=Latin}\p{N}']+$/u.test(w);

/** Rough English syllable count (vowel groups, silent e, consonant+le). At least 1. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Drop silent endings (-es, -ed, -e) but keep consonant+"le" ("table" stays 2 syllables).
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, s.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

export const STOPWORDS = new Set(
  (
    "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves s t don re ve ll d m"
  ).split(" ")
);
