// Carousel cover and inner slides.
import { AccentMark, CornerLogo, Frame, FullBleedPhoto, Headline, logoSpace, PAD, scheme, Subline, type LayoutProps } from "./shared";

const WHITE = "#FFFFFF";
const WHITE_MUTED = "rgba(255,255,255,0.86)";

/** Cover: photo on one side, big headline, "swipe" cue. */
export function CarouselCover(p: LayoutProps) {
  const s = scheme(p);
  if (p.photo) {
    // Full-bleed photo with the text on a dark fade, so the picture is never cropped to a strip.
    return (
      <Frame bg={s.bg} style={{ flexDirection: "column", justifyContent: "flex-end" }}>
        <FullBleedPhoto p={p} />
        <div style={{ display: "flex", flexDirection: "column", padding: PAD, paddingBottom: PAD + 40 + logoSpace(p, "bottom") }}>
          <AccentMark p={p} color={s.accent} />
          <Headline p={p} color={WHITE} size={Math.min(88, Math.round(4800 / Math.max(p.headline.length, 18)) + 22)} />
          <Subline p={p} color={WHITE_MUTED} size={34} />
          <div style={{ display: "flex", alignItems: "center", marginTop: 40, fontFamily: p.fonts.body, fontWeight: 700, fontSize: 28, color: WHITE }}>
            Swipe →
          </div>
        </div>
        <CornerLogo p={p} color={WHITE} />
      </Frame>
    );
  }
  return (
    <Frame bg={s.bg} style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: PAD, paddingBottom: PAD + logoSpace(p, "bottom") }}>
        <AccentMark p={p} color={s.accent} />
        <Headline p={p} color={s.fg} />
        <Subline p={p} color={s.muted} size={34} />
        <div style={{ display: "flex", alignItems: "center", marginTop: 40, fontFamily: p.fonts.body, fontWeight: 700, fontSize: 28, color: s.accent }}>
          Swipe →
        </div>
      </div>
      <CornerLogo p={p} color={s.fg} />
    </Frame>
  );
}

/** Inner slide: number, headline, short body, progress dots. */
export function CarouselSlide(p: LayoutProps) {
  const s = scheme(p);
  const { index = 2, total = 5 } = p.slide ?? {};
  const last = index === total;
  if (p.photo) {
    return (
      <Frame bg={s.bg} style={{ flexDirection: "column", justifyContent: "flex-end", padding: PAD, paddingBottom: PAD + 70 }}>
        <FullBleedPhoto p={p} />
        {p.noNumber ? null : (
          <div style={{ display: "flex", fontFamily: p.fonts.heading, fontWeight: 700, fontSize: 96, lineHeight: 1, color: s.accent }}>
            {String(index - 1).padStart(2, "0")}
          </div>
        )}
        <Headline p={p} color={WHITE} size={Math.min(76, Math.round(4200 / Math.max(p.headline.length, 16)) + 20)} style={{ marginTop: p.noNumber ? 0 : 24 }} />
        <Subline p={p} color={WHITE_MUTED} size={34} />
        {last && p.cta ? (
          <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 40, padding: "18px 34px", background: s.accent, color: s.onAccent, fontFamily: p.fonts.body, fontWeight: 700, fontSize: 30, borderRadius: Math.min(p.kit.radius * 2, 40), maxWidth: p.width - PAD * 2 }}>
            {p.cta.length > 60 ? p.cta.slice(0, 58).replace(/\s+\S*$/, "") + "…" : p.cta}
          </div>
        ) : null}
        <div style={{ display: "flex", position: "absolute", bottom: PAD * 0.8, right: PAD }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ display: "flex", width: i + 1 === index ? 36 : 12, height: 12, borderRadius: 6, marginLeft: 10, background: i + 1 === index ? s.accent : WHITE, opacity: i + 1 === index ? 1 : 0.5 }} />
          ))}
        </div>
        <CornerLogo p={{ ...p, kit: { ...p.kit, logoPosition: "bottom-left" } }} color={WHITE} size={60} />
      </Frame>
    );
  }
  return (
    <Frame bg={s.bg} style={{ flexDirection: "column", padding: PAD, paddingTop: PAD * 1.4, ...(p.noNumber ? { justifyContent: "center", paddingTop: PAD, paddingBottom: PAD * 1.6 } : {}) }}>
      {p.noNumber ? null : (
        <div style={{ display: "flex", fontFamily: p.fonts.heading, fontWeight: 700, fontSize: 120, lineHeight: 1, color: s.accent }}>
          {String(index - 1).padStart(2, "0")}
        </div>
      )}
      <Headline p={p} color={s.fg} size={Math.min(80, Math.round(4400 / Math.max(p.headline.length, 16)) + 22)} style={{ marginTop: p.noNumber ? 0 : 40 }} />
      <Subline p={p} color={s.muted} size={36} />
      {last && p.cta ? (
        <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 48, padding: "18px 34px", background: s.accent, color: s.onAccent, fontFamily: p.fonts.body, fontWeight: 700, fontSize: 30, borderRadius: Math.min(p.kit.radius * 2, 40), ...(p.noNumber ? { maxWidth: p.width - PAD * 2 } : {}) }}>
          {p.noNumber ? p.cta.slice(0, 90) : p.cta.length > 42 ? p.cta.slice(0, 40).replace(/\s+\S*$/, "") + "…" : p.cta}
        </div>
      ) : null}
      <div style={{ display: "flex", position: "absolute", bottom: PAD * 0.8, right: PAD }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ display: "flex", width: i + 1 === index ? 36 : 12, height: 12, borderRadius: 6, marginLeft: 10, background: i + 1 === index ? s.accent : s.muted, opacity: i + 1 === index ? 1 : 0.4 }} />
        ))}
      </div>
      <CornerLogo p={{ ...p, kit: { ...p.kit, logoPosition: "bottom-left" } }} color={s.fg} size={60} />
    </Frame>
  );
}
