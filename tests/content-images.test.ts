import { describe, expect, it } from "vitest";
import { contentImages } from "@/lib/web";

const abs = (h?: string) => (h ? new URL(h, "https://example.com").toString() : undefined);

describe("contentImages", () => {
  it("keeps commas inside cloudinary-style srcSet URLs", () => {
    const html = `<img alt="" class="opacity-0 transition-opacity" srcSet="https://res.cloudinary.com/x/image/upload/f_auto,c_limit,w_640,q_auto/a.jpg 640w, https://res.cloudinary.com/x/image/upload/f_auto,c_limit,w_1200,q_auto/a.jpg 1200w" src="data:image/gif;base64,AAAA">`;
    expect(contentImages(html, abs)).toEqual(["https://res.cloudinary.com/x/image/upload/f_auto,c_limit,w_1200,q_auto/a.jpg"]);
  });
});
