import { fetchCapped, fetchPageEvidence, fetchWebsiteEvidence, type PageEvidence, type WebsiteEvidence } from "./web";

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$)/i;
const ASSET = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|mp4|mov|mp3|css|js|xml|json|woff2?)$/i;
const SKIP_PATH = /\/(cart|checkout|account|login|log-in|signin|sign-in|signup|sign-up|register|search|wp-admin|wp-json|cdn-cgi|tag|tags|author|feed|privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|legal|cookie|cookies|cookie-policy|refund|refund-policy|returns|shipping-policy|sitemap)(\/|$)|\/page\/\d+/i;

const RANKS: [RegExp, number][] = [
  [/about|story|team|our-|mission|values|who-we/i, 0],
  [/product|shop|collection|service|menu|pricing|offer|work|portfolio/i, 1],
  [/faq|contact|blog|journal|news|press/i, 2],
];

const host = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** Canonical form used to dedupe pages: no hash, no tracking params, no trailing slash. */
export function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

/** Same-site, content-looking links, most brand-relevant and shallowest first. */
export function selectLinks(links: string[], origin: string, max: number): string[] {
  const base = new URL(origin);
  const seen = new Set<string>();
  const scored: { url: string; rank: number; depth: number }[] = [];
  for (const l of links) {
    const n = normaliseUrl(l);
    if (!n || seen.has(n)) continue;
    const u = new URL(n);
    if (host(u.hostname) !== host(base.hostname)) continue;
    if (ASSET.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    if (u.pathname === "/" || u.pathname === "") continue; // the home page is read separately
    seen.add(n);
    const rank = RANKS.find(([re]) => re.test(u.pathname))?.[1] ?? 3;
    scored.push({ url: n, rank, depth: u.pathname.split("/").filter(Boolean).length });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.depth - b.depth).slice(0, max).map((s) => s.url);
}

/** Reads `User-agent: *` rules. The longest matching rule wins; ties go to Allow. */
export function parseRobots(txt: string): (path: string) => boolean {
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false;
  let inAgentRun = false; // consecutive User-agent lines form one group
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      applies = (inAgentRun ? applies : false) || val === "*";
      inAgentRun = true;
      continue;
    }
    inAgentRun = false;
    if (applies && (key === "allow" || key === "disallow") && val) {
      rules.push({ allow: key === "allow", path: val });
    }
  }
  const matches = (rule: string, path: string) => {
    const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(path);
  };
  return (path) => {
    let best: { allow: boolean; len: number } | null = null;
    for (const r of rules) {
      if (!matches(r.path, path)) continue;
      if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
    }
    return best ? best.allow : true;
  };
}

function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** `Sitemap:` lines declared in robots.txt (same-origin only). */
export function robotsSitemaps(txt: string, origin: string): string[] {
  return [...txt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]).filter((u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  });
}

async function readSitemap(origin: string, cap: number, declared: string[] = []): Promise<string[]> {
  try {
    const first = declared[0] ?? new URL("/sitemap.xml", origin).toString();
    const root = await fetchCapped(first, 600_000, 6_000);
    if (!root) return [];
    let locs = sitemapLocs(root.text);
    const nested = locs.filter((l) => /\.xml(\?|$)/i.test(l)).slice(0, 2);
    if (nested.length) {
      const parts = await Promise.all(nested.map((n) => fetchCapped(n, 600_000, 6_000).catch(() => null)));
      locs = [...locs.filter((l) => !/\.xml(\?|$)/i.test(l)), ...parts.flatMap((p) => (p ? sitemapLocs(p.text) : []))];
    }
    return locs.slice(0, cap * 4);
  } catch {
    return [];
  }
}

export interface CrawlResult {
  home: WebsiteEvidence;
  pages: PageEvidence[];
  /** Candidate pages found but not read (cap, budget or robots). */
  skipped: number;
}

export interface CrawlOptions {
  maxPages?: number;
  concurrency?: number;
  budgetMs?: number;
  perPageTimeoutMs?: number;
  onPage?: (read: number, max: number, page: PageEvidence) => void;
  /** Fires as soon as the home page is read, before the rest of the crawl. */
  onHome?: (home: WebsiteEvidence) => void;
}

/** Reads the home page, then up to `maxPages - 1` more same-site pages, politely and within a time budget. */
export async function crawlSite(rawUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const { maxPages = 25, concurrency = 8, budgetMs = 25_000, perPageTimeoutMs = 5_000, onPage, onHome } = opts;
  const started = Date.now();
  // robots.txt doesn't depend on the home page: fetch both at once.
  const robotsP = (async () => {
    try {
      return await fetchCapped(new URL("/robots.txt", new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).origin).toString(), 100_000, 4_000);
    } catch {
      return null;
    }
  })();
  const home = await fetchWebsiteEvidence(rawUrl);
  try {
    onHome?.(home);
  } catch {
    /* progress display must never break the crawl */
  }
  const origin = new URL(home.url).origin;

  let allowed = (_: string) => true;
  const robots = await robotsP;
  if (robots) allowed = parseRobots(robots.text);

  // Always read the sitemap too: selectLinks ranks about/product/menu pages first, so the small page budget goes to high-signal routes.
  const sitemapUrls = await readSitemap(origin, maxPages, robots ? robotsSitemaps(robots.text, origin) : []);
  const candidates = selectLinks([...home.links, ...sitemapUrls], origin, maxPages * 2);
  const queue = candidates.filter((u) => allowed(new URL(u).pathname + new URL(u).search));

  const pages: PageEvidence[] = [];
  const seenText = new Set<string>([home.copySample.slice(0, 300)]);
  const seenUrl = new Set<string>([normaliseUrl(home.url) ?? home.url]);
  let next = 0;

  const worker = async () => {
    while (pages.length < maxPages - 1 && Date.now() - started < budgetMs) {
      const url = queue[next++];
      if (!url) return;
      try {
        // Don't let a slow page run past the crawl budget.
        const left = budgetMs - (Date.now() - started);
        if (left <= 0) return;
        const p = await Promise.race([fetchPageEvidence(url, Math.min(perPageTimeoutMs, left + 500)), new Promise<null>((r) => setTimeout(() => r(null), left + 500))]);
        if (!p || p.text.length < 80) continue;
        const finalKey = normaliseUrl(p.url) ?? p.url;
        const fp = p.text.slice(0, 300);
        if (seenUrl.has(finalKey) || seenText.has(fp) || pages.length >= maxPages - 1) continue;
        seenUrl.add(finalKey);
        seenText.add(fp);
        pages.push(p);
        onPage?.(pages.length + 1, maxPages, p);
      } catch {
        /* skip an unreadable page */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, worker));

  return { home, pages, skipped: Math.max(0, queue.length - pages.length) };
}
