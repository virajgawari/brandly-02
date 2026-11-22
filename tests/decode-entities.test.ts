import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/lib/web";

describe("decodeEntities", () => {
  it("decodes numeric, hex and named entities", () => {
    expect(decodeEntities("World&#39;s Largest &amp; Best")).toBe("World's Largest & Best");
    expect(decodeEntities("It&#x27;s &rsquo;ok&rsquo; &nbsp;fine")).toBe("It's \u2019ok\u2019  fine");
  });
  it("does not double-decode", () => {
    expect(decodeEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });
  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#0;")).toBe("&bogus; &#0;");
  });
});
