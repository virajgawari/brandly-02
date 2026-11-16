import { beforeEach, describe, expect, it, vi } from "vitest";

const pagesByUrl = new Map<string, string>();
const hits: string[] = [];

vi.mock("@/lib/net/safe-fetch", () => ({
  assertPublicUrl: async (u: string) => new URL(u),
  safeFetch: async (u: string) => {
    hits.push(u);
    const body = pagesByUrl.get(u);
    if (body === undefined) return new Response("nope", { status: 404 });
    if (body === "__throw__") throw new Error("boom");
    return new Response(body, { status: 200 });
  },
}));

import { crawlSite, normaliseUrl, parseRobots, selectLinks } from "@/lib/crawl";

const html = (title: string, body: string, links: string[] = []) =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p>${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`;
const long = (s: string) => `${s} `.repeat(30);

beforeEach(() => {
  pagesByUrl.clear();
  hits.length = 0;
});

describe("normaliseUrl", () => {
  it("drops hash, tracking params and trailing slash", () => {
    expect(normaliseUrl("https://Example.com/about/?utm_source=x&b=1#top")).toBe("https://example.com/about?b=1");
    expect(normaliseUrl("mailto:a@b.c")).toBeNull();
  });
});

describe("selectLinks", () => {
  const origin = "https://shop.test";
  it("keeps same-site content pages, ranked, skipping assets and utility paths", () => {
    const out = selectLinks(
      [
        "https://shop.test/blog/post-1", "https://shop.test/about", "https://shop.test/cart", "https://shop.test/a.pdf",
        "https://other.test/about", "https://www.shop.test/products/candle", "https://shop.test/about/", "https://shop.test/",
        "https://shop.test/page/2",
      ],
      origin,
      10
    );
    expect(out).toEqual(["https://shop.test/about", "https://www.shop.test/products/candle", "https://shop.test/blog/post-1"]);
  });
  it("caps the result", () => {
    const links = Array.from({ length: 30 }, (_, i) => `https://shop.test/p${i}`);
    expect(selectLinks(links, origin, 5)).toHaveLength(5);
  });
});

describe("parseRobots", () => {
  const ok = parseRobots("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\n");
  it("applies the * group, longest rule wins", () => {
    expect(ok("/private/x")).toBe(false);
    expect(ok("/private/open/y")).toBe(true);
    expect(ok("/g")).toBe(true);
    expect(ok("/about")).toBe(true);
  });
  it("allows everything with no rules", () => expect(parseRobots("")("/x")).toBe(true));
});

describe("crawlSite", () => {
  it("reads the home page and linked pages, honouring robots and dedupe", async () => {
    pagesByUrl.set("https://s.test/", html("Home", long("welcome"), ["/about", "/shop", "/secret", "/dupe", "/broken"]));
    pagesByUrl.set("https://s.test/robots.txt", "User-agent: *\nDisallow: /secret");
    pagesByUrl.set("https://s.test/about", html("About", long("our story")));
    pagesByUrl.set("https://s.test/shop", html("Shop", long("products")));
    pagesByUrl.set("https://s.test/secret", html("Secret", long("hidden")));
    pagesByUrl.set("https://s.test/dupe", html("About", long("our story")));
    pagesByUrl.set("https://s.test/broken", "__throw__");
    const r = await crawlSite("https://s.test/");
    const titles = r.pages.map((p) => p.title).sort();
    expect(titles).toEqual(["About", "Shop"]);
    expect(hits).not.toContain("https://s.test/secret");
  });

  it("respects maxPages", async () => {
    const links = Array.from({ length: 10 }, (_, i) => `/p${i}`);
    pagesByUrl.set("https://s.test/", html("Home", long("hi"), links));
    links.forEach((l, i) => pagesByUrl.set(`https://s.test${l}`, html(`P${i}`, long(`page number ${i} unique`))));
    const r = await crawlSite("https://s.test/", { maxPages: 4 });
    expect(r.pages).toHaveLength(3);
  });
});
