/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// Product carousel: a cover with a collage of the products, then one slide per product.
import type { CSSProperties } from "react";
import { AccentMark, CornerLogo, Frame, Headline, logoSpace, PAD, Photo, scheme, Subline, type LayoutProps } from "./shared";

const GAP = 8;

function Tile({ src, style, radius }: { src: string; style: CSSProperties; radius: number }) {
  return <img src={src} style={{ objectFit: "cover", borderRadius: radius, ...style }} />;
}

/** Up to four product photos in one block of the given size. */
function Collage({ photos, width, height, radius }: { photos: string[]; width: number; height: number; radius: number }) {
  const list = photos.slice(0, 4);
  const half = (n: number) => Math.floor((n - GAP) / 2);
  if (list.length <= 1) {
    return <Tile src={list[0]} radius={radius} style={{ width, height }} />;
  }
  if (list.length === 2) {
    return (
      <div style={{ display: "flex", width, height }}>
        <Tile src={list[0]} radius={radius} style={{ width: half(width), height }} />
        <Tile src={list[1]} radius={radius} style={{ width: half(width), height, marginLeft: GAP }} />
      </div>
    );
  }
  if (list.length === 3) {
    return (
      <div style={{ display: "flex", width, height }}>
        <Tile src={list[0]} radius={radius} style={{ width: half(width), height }} />
        <div style={{ display: "flex", flexDirection: "column", width: half(width), marginLeft: GAP }}>
          <Tile src={list[1]} radius={radius} style={{ width: half(width), height: half(height) }} />
          <Tile src={list[2]} radius={radius} style={{ width: half(width), height: half(height), marginTop: GAP }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", width, height }}>
      <div style={{ display: "flex", width, height: half(height) }}>
        <Tile src={list[0]} radius={radius} style={{ width: half(width), height: half(height) }} />
        <Tile src={list[1]} radius={radius} style={{ width: half(width), height: half(height), marginLeft: GAP }} />
      </div>
      <div style={{ display: "flex", width, height: half(height), marginTop: GAP }}>
        <Tile src={list[2]} radius={radius} style={{ width: half(width), height: half(height) }} />
        <Tile src={list[3]} radius={radius} style={{ width: half(width), height: half(height), marginLeft: GAP }} />
      </div>
    </div>
  );
}

/** Cover: collage of the products, headline, swipe cue. */
export function ProductCover(p: LayoutProps) {
  const s = scheme(p);
  const photos = p.photos?.length ? p.photos : p.photo ? [p.photo] : [];
  const blockH = Math.round(p.height * 0.5);
  const radius = Math.min(p.kit.radius, 24);
  const framed = p.kit.photoTreatment === "framed";
  const pad = framed ? PAD : 0;
  return (
    <Frame bg={s.bg} style={{ flexDirection: "column" }}>
      {photos.length ? (
        <div style={{ display: "flex", padding: pad, paddingBottom: 0 }}>
          <Collage photos={photos} width={p.width - pad * 2} height={blockH - pad} radius={framed ? radius : 0} />
        </div>
      ) : (
        <Photo p={p} style={{ width: p.width, height: blockH }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: PAD, paddingBottom: PAD + logoSpace(p, "bottom") }}>
        <AccentMark p={p} color={s.accent} />
        <Headline p={p} color={s.fg} size={Math.min(84, Math.round(4800 / Math.max(p.headline.length, 18)) + 20)} />
        <Subline p={p} color={s.muted} size={32} />
        <div style={{ display: "flex", marginTop: 32, fontFamily: p.fonts.body, fontWeight: 700, fontSize: 28, color: s.accent }}>Swipe →</div>
      </div>
      <CornerLogo p={p} color={s.fg} />
    </Frame>
  );
}

/** One product: big photo, name, one benefit, progress dots. */
export function ProductSlide(p: LayoutProps) {
  const s = scheme(p);
  const { index = 2, total = 5 } = p.slide ?? {};
  const photoH = Math.round(p.height * 0.62);
  const framed = p.kit.photoTreatment === "framed";
  const pad = framed ? PAD : 0;
  const radius = framed ? Math.min(p.kit.radius, 24) : 0;
  return (
    <Frame bg={s.bg} style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", padding: pad, paddingBottom: 0 }}>
        <Photo p={p} style={{ width: p.width - pad * 2, height: photoH - pad, borderRadius: radius }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: PAD, paddingTop: 36, paddingBottom: PAD + logoSpace(p, "bottom") * 0.4 }}>
        <Headline p={p} color={s.fg} size={Math.min(76, Math.round(4000 / Math.max(p.headline.length, 14)) + 20)} />
        <Subline p={p} color={s.muted} size={32} style={{ marginTop: 18 }} />
      </div>
      <div style={{ display: "flex", position: "absolute", bottom: PAD * 0.8, right: PAD }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ display: "flex", width: i + 1 === index ? 36 : 12, height: 12, borderRadius: 6, marginLeft: 10, background: i + 1 === index ? s.accent : s.muted, opacity: i + 1 === index ? 1 : 0.4 }} />
        ))}
      </div>
      <CornerLogo p={{ ...p, kit: { ...p.kit, logoPosition: "bottom-left" } }} color={s.fg} size={60} />
    </Frame>
  );
}
