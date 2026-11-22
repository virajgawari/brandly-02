const GENERIC = /^(home|homepage|welcome|official( site| website)?|shop|store|online store|buy .*|.*\b(online|official site)\b.*|index)$/i;

const hostWord = (url: string): string => {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "bluetokaicoffee.com" → "Bluetokaicoffee". Used until the site title is known. */
export function nameFromUrl(url: string): string {
  const w = hostWord(url);
  return w ? w[0].toUpperCase() + w.slice(1) : "";
}

/** A title with no separator ("Mamaearth Natural Skin & Hair Care Products") is a tagline, not a name: keep only the leading words that spell the host. */
function trimToHost(part: string, host: string): string {
  const words = part.split(/\s+/);
  if (words.length <= 4 || !squash(part).includes(host)) return part;
  for (let i = 1; i < words.length; i++) {
    if (squash(words.slice(0, i).join(" ")).includes(host)) return words.slice(0, i).join(" ");
  }
  return part;
}

/**
 * Picks the brand name out of a page title like "Blue Tokai Coffee Roasters | Buy Coffee Online".
 * Prefers the segment that matches the hostname, then the first non-generic one.
 */
export function brandNameFromTitle(title: string | undefined, url: string): string {
  const parts = (title ?? "")
    .split(/\s+[|–—\-:·]\s+|[|–—·]|:\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const host = squash(hostWord(url));
  if (host) {
    const hit = parts.find((p) => squash(p) && (squash(p).includes(host) || host.includes(squash(p))));
    if (hit) return trimToHost(hit, host);
  }
  const real = parts.find((p) => !GENERIC.test(p));
  return real ?? nameFromUrl(url);
}
