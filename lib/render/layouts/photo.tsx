// Photo-led layouts: photo + band, full-bleed, split, framed product.
import { readableOn } from "@/lib/brand/color";
import { AccentMark, CornerLogo, Cta, edgePad, Frame, Headline, Logo, logoSpace, PAD, Photo, scheme, Subline, textBoxStyle, type LayoutProps } from "./shared";

/** Photo fills the frame; the headline sits directly on its calm lower area with only a soft fade, no card or band. */
export function PhotoBand(p: LayoutProps) {
  const s = scheme(p);
  return (
    <Frame bg="#111111">
      <Photo p={p} style={{ position: "absolute", top: 0, left: 0, width: p.width, height: p.height }} />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: p.width,
          height: p.height,
          backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", height: "100%", padding: PAD, paddingBottom: PAD + logoSpace(p, "bottom") }}>
        <div style={{ display: "flex", width: 72, height: 6, marginBottom: 28, background: s.accent === "#111111" ? p.colors.accent : s.accent, borderRadius: 3 }} />
        <div style={{ display: "flex", flexDirection: "column", ...textBoxStyle(p) }}>
          <Headline p={p} color="#FFFFFF" size={Math.min(92, Math.round(5200 / Math.max(p.headline.length, 20)) + 24)} />
          <Subline p={p} color="rgba(255,255,255,0.88)" size={34} />
        </div>
      </div>
      <CornerLogo p={p} color="#FFFFFF" />
    </Frame>
  );
}

/** Photo fills the frame; a gradient keeps the headline readable. */
export function FullBleed(p: LayoutProps) {
  const s = scheme(p);
  const top = p.kit.logoPosition.startsWith("top");
  return (
    <Frame bg="#111111">
      <Photo p={p} style={{ position: "absolute", top: 0, left: 0, width: p.width, height: p.height }} />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: p.width,
          height: p.height,
          backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.78) 100%)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", height: "100%", padding: PAD, paddingBottom: PAD + logoSpace(p, "bottom") }}>
        <AccentMark p={p} color={s.accent === "#111111" ? p.colors.accent : s.accent} />
        <div style={{ display: "flex", flexDirection: "column", ...textBoxStyle(p) }}>
          <Headline p={p} color="#FFFFFF" />
          <Subline p={p} color="rgba(255,255,255,0.85)" />
        </div>
      </div>
      <CornerLogo p={p} color="#FFFFFF" />
    </Frame>
  );
}

/** Half photo, half colour. Uses items as a two-sided comparison when present. */
export function Split(p: LayoutProps) {
  const s = scheme(p);
  const vertical = p.height > p.width;
  const half = vertical ? { width: p.width, height: Math.round(p.height / 2) } : { width: Math.round(p.width / 2), height: p.height };
  return (
    <Frame bg={s.bg} style={{ flexDirection: vertical ? "column" : "row" }}>
      <Photo p={p} style={half} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", ...half, padding: PAD, ...(vertical ? { paddingBottom: PAD + logoSpace(p, "bottom") } : edgePad(p)) }}>
        <AccentMark p={p} color={s.accent} />
        <Headline p={p} color={s.fg} size={Math.min(76, Math.round(4200 / Math.max(p.headline.length, 18)) + 18)} />
        {p.items?.length ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            {p.items.slice(0, 2).map((it, i) => (
              <div key={i} style={{ display: "flex", fontFamily: p.fonts.body, fontSize: 30, color: i === 0 ? s.muted : s.fg, marginTop: i ? 14 : 0 }}>
                {it}
              </div>
            ))}
          </div>
        ) : (
          <Subline p={p} color={s.muted} size={32} />
        )}
      </div>
      <CornerLogo p={p} color={s.fg} />
    </Frame>
  );
}

/** Product photo inside a frame on the brand colour, headline above, CTA below. */
export function Framed(p: LayoutProps) {
  const s = scheme(p);
  const framed = p.kit.photoTreatment === "framed";
  const chip = readableOn(s.bg) === "#FFFFFF" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";
  return (
    <Frame bg={s.bg} style={{ flexDirection: "column", padding: PAD, paddingTop: PAD * 0.8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Logo p={p} color={s.fg} size={64} />
        {p.stat ? (
          <div style={{ display: "flex", padding: "10px 24px", background: s.accent, color: s.onAccent, fontFamily: p.fonts.heading, fontWeight: 700, fontSize: 34, borderRadius: Math.min(p.kit.radius * 2, 40) }}>
            {p.stat}
          </div>
        ) : null}
      </div>
      <Headline p={p} color={s.fg} size={Math.min(76, Math.round(4400 / Math.max(p.headline.length, 18)) + 16)} style={{ marginTop: 36 }} />
      <div style={{ display: "flex", flexGrow: 1, marginTop: 36, padding: framed ? 16 : 0, background: framed ? chip : "transparent", borderRadius: p.kit.radius }}>
        <Photo p={p} style={{ width: "100%", height: "100%", borderRadius: Math.max(p.kit.radius - 6, 0) }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Subline p={p} color={s.muted} size={30} style={{ marginTop: 28, maxWidth: p.cta ? p.width * 0.45 : undefined }} />
        <Cta p={p} bg={s.accent} fg={s.onAccent} />
      </div>
    </Frame>
  );
}
