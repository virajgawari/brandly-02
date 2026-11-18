"use client";
import { useEffect, useRef, useState } from "react";
import { PlatformIcon, TemplateIcon } from "@/components/ui/icons";
import AppShell from "@/components/layout/AppShell";
import { useStore } from "@/lib/store";
import { Button, Input, Textarea, Card, Chip, SectionLabel, PageHeader, EmptyState } from "@/components/ui";
import PlatformPreview from "@/components/composer/PlatformPreview";
import { Scorecard } from "@/components/composer/Scorecard";
import IdeaCards from "@/components/composer/IdeaCards";
import PhoneFrame from "@/components/composer/PhoneFrame";
import { EditSection } from "@/components/composer/EditPanel";
import type { PostIdea } from "@/lib/content/ideas";
import Link from "next/link";
import type { GeneratedPost, Platform, ProductRef, RenderedMedia, TemplateCategory, ScheduledPost } from "@/lib/types";
import { chunkProducts, MAX_CAROUSEL_PRODUCTS } from "@/lib/content/brief";
import type { LayoutId } from "@/lib/brand/model";
import { LAYOUT_LABELS, layoutKitOf } from "@/lib/render/kit";
import { CONTENT_TEMPLATES, PLATFORM_LABELS } from "@/lib/templates";
import { format, addDays } from "date-fns";
import { sendFeedback, track } from "@/lib/track";

const BAD_REASONS = ["Off-brand", "Wrong tone", "Too long", "Too generic", "Wrong facts"];

const PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin", "twitter"];
const TONES = ["Brand default", "Witty & playful", "Professional", "Inspirational", "Educational", "Urgent"];

export default function ComposerPage() {
  const { getActiveBrand, addPost } = useStore();
  const brand = getActiveBrand();

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateCategory>("product_launch");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["instagram"]);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Brand default");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState<GeneratedPost | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(
    format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
  );
  const [saved, setSaved] = useState(false);
  const [size, setSize] = useState<RenderedMedia["size"]>("1080x1350");
  const [rendered, setRendered] = useState<RenderedMedia | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [carouselOn, setCarouselOn] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [batch, setBatch] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [show, setShow] = useState<{ logo: boolean; cta: boolean; subline: boolean }>({ logo: true, cta: true, subline: true });
  const [ideas, setIdeas] = useState<PostIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const renderSeq = useRef(0);
  const textTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(textTimer.current), []);

  // Arriving from the catalogue (/composer?product=<id>): start the brief from that product.
  const catalogBrandId = brand?.id;
  const [catalogProductId, setCatalogProductId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    if (!id || !catalogBrandId) return;
    let live = true;
    fetch(`/api/products?brandId=${catalogBrandId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { products: { id: string; name: string; description: string; price: string | null }[] } | null) => {
        const p = d?.products.find((x) => x.id === id);
        if (!live || !p) return;
        setCatalogProductId(p.id);
        setTopic(p.name);
        setAdditionalContext([p.description, p.price ? `Price: ${p.price}` : ""].filter(Boolean).join("\n"));
        setOptionsOpen(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [catalogBrandId]);

  type PhotoChoice = RenderedMedia["photo"] | null | "auto" | "generate";
  const callRender = async (p: GeneratedPost, o: { layout?: LayoutId; photo?: PhotoChoice; size?: RenderedMedia["size"]; store?: boolean; key?: string; show?: typeof show }, onPhotoError?: (msg: string) => void) => {
    const res = await fetch("/api/render-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandModel: brand?.model, post: p, layout: o.layout ?? p.layout, photo: o.photo, size: o.size ?? size, store: o.store, key: o.key, show: o.show ?? show }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.rendered) throw new Error(data.error ?? `Couldn't make the image (HTTP ${res.status})`);
    if (data.photoError) onPhotoError?.(data.photoError);
    return data.rendered as RenderedMedia;
  };

  /** Renders the branded preview. Only the latest request updates the screen. */
  const renderPreview = async (p: GeneratedPost, o: { layout?: LayoutId; photo?: PhotoChoice; size?: RenderedMedia["size"]; show?: typeof show } = {}) => {
    if (!brand?.model) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    setRenderError(null);
    try {
      let photoError: string | undefined;
      const r = await callRender(p, o, (m) => (photoError = m));
      if (seq !== renderSeq.current) return;
      setRendered(r);
      if (photoError) setRenderError(photoError);
      setSaved(false);
      if (o.photo === "generate" && generationId) track("image_generated", { generationId, props: { layout: r.layout } });
    } catch (err) {
      if (seq === renderSeq.current) setRenderError(err instanceof Error ? err.message : String(err));
    }
    if (seq === renderSeq.current) setRendering(false);
  };

  // Keep the photo already chosen when only the layout or text changes.
  const currentPhoto = (): PhotoChoice => rendered?.photo ?? "auto";

  const switchLayout = (l: LayoutId) => {
    if (!post) return;
    const next = { ...post, layout: l };
    setPost(next);
    renderPreview(next, { layout: l, photo: currentPhoto() });
  };

  /** Editing the image text re-renders without another AI call. */
  const editVisualText = (field: "headline" | "subline", value: string) => {
    if (!post) return;
    const next = { ...post, [field]: value };
    setPost(next);
    clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => renderPreview(next, { photo: currentPhoto() }), 600);
  };

  const toggleShow = (k: keyof typeof show, v: boolean) => {
    const next = { ...show, [k]: v };
    setShow(next);
    if (post) renderPreview(post, { photo: currentPhoto(), show: next });
  };

  const suggestIdeas = async () => {
    if (!brand?.model) return;
    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const res = await fetch("/api/suggest-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandModel: brand.model }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ideas) throw new Error(data.error ?? "Couldn't get ideas just now.");
      setIdeas(data.ideas as PostIdea[]);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : String(err));
    }
    setIdeasLoading(false);
  };

  const pickIdea = (i: PostIdea) => {
    setSelectedTemplate(i.template as TemplateCategory);
    setTopic(`${i.title}. ${i.pitch}`);
    generate(batch, { template: i.template as TemplateCategory, topic: `${i.title}. ${i.pitch}` });
  };

  const backToIdeas = () => {
    setPost(null);
    setRendered(null);
    setGenError(null);
    setSaved(false);
  };

  const brandPhotos = brand?.model?.expression.photos ?? [];
  const productPhotos = brandPhotos.filter((p) => p.role === "product");
  const batches = chunkProducts(picked);
  const productsFor = (n: number): ProductRef[] =>
    (batches[n] ?? []).flatMap((path) => {
      const ph = productPhotos.find((p) => p.path === path);
      return ph ? [{ path, name: ph.product?.name || "Product", note: ph.product?.note }] : [];
    });
  const isProductPost = post?.layout === "product-cover";

  const thumbKey = productPhotos.map((p) => p.path).join("|");
  const brandId = brand?.model?.id;
  useEffect(() => {
    if (!carouselOn || !brandId) return;
    const missing = productPhotos.filter((p) => !thumbs[p.path]);
    if (!missing.length) return;
    const q = missing.map((p) => `path=${encodeURIComponent(p.path)}`).join("&");
    fetch(`/api/brands/${brandId}/photos?${q}`)
      .then((r) => r.json())
      .then((d: { photos?: { path: string; url: string }[] }) => setThumbs((t) => ({ ...t, ...Object.fromEntries((d.photos ?? []).map((p) => [p.path, p.url])) })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselOn, thumbKey, brandId]);

  const togglePicked = (path: string) => {
    setBatch(0);
    setPicked((x) => (x.includes(path) ? x.filter((y) => y !== path) : [...x, path]));
  };
  const nextBrandPhoto = () => {
    if (!post || !brandPhotos.length) return;
    const i = brandPhotos.findIndex((p) => p.path === rendered?.photo?.ref);
    renderPreview(post, { photo: { kind: "brand", ref: brandPhotos[(i + 1) % brandPhotos.length].path } });
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const generate = async (batchIndex = batch, over?: { template: TemplateCategory; topic: string }) => {
    if (!brand || selectedPlatforms.length === 0) return;
    const products = carouselOn ? productsFor(batchIndex) : [];
    if (carouselOn && products.length < 2) {
      setGenError("Pick at least two products for a carousel.");
      return;
    }
    // Asking again for the same request means the last one wasn't good enough.
    if (post && generationId && !saved) track("regenerated", { generationId });
    setGenerating(true);
    setGenError(null);
    setRating(null);
    setReasons([]);
    setFeedbackSent(false);
    setPost(null);
    setSaved(false);
    setRendered(null);
    setRenderError(null);
    const res = await fetch("/api/generate-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandDNA: brand.dna,
        brandModel: brand.model,
        template: over?.template ?? selectedTemplate,
        topic: over?.topic ?? topic,
        platforms: selectedPlatforms,
        tone: tone === "Brand default" ? undefined : tone,
        additionalContext,
        ...(products.length ? { products } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPost(data.post ?? null);
    setGenerationId(data.generationId ?? null);
    if (!data.post) setGenError(data.error ?? "Couldn't write a post. Please try again.");
    setGenerating(false);
    if (data.post) renderPreview(data.post, { photo: "auto" });
  };

  const nextCarousel = () => {
    const n = batch + 1;
    setBatch(n);
    generate(n);
  };

  const schedulePost = async (status: "draft" | "scheduled") => {
    if (!post || !brand) return;
    const id = crypto.randomUUID();
    setSaving(true);
    let content: GeneratedPost = { ...post, rendered: undefined };
    // The preview only lives in the browser: save the branded image(s) to storage now.
    if (rendered) {
      try {
        const stored = await callRender(post, { layout: rendered.layout, photo: rendered.photo ?? null, size: rendered.size, store: true, key: id });
        content = { ...post, layout: stored.layout, rendered: stored };
      } catch (err) {
        setRenderError(err instanceof Error ? err.message : String(err));
        setSaving(false);
        return;
      }
    }
    const scheduled: ScheduledPost = {
      id,
      brandId: brand.id,
      content,
      generationId: generationId ?? undefined,
      platforms: selectedPlatforms,
      scheduledAt: new Date(scheduleDate).toISOString(),
      status,
      createdAt: new Date().toISOString(),
      ...(content.rendered?.urls[0] ? { mediaUrl: content.rendered.urls[0] } : {}),
    };
    addPost(scheduled, { template: selectedTemplate, topic: topic || undefined, productId: catalogProductId });
    setSaving(false);
    setSaved(true);
  };

  const kit = layoutKitOf(brand?.model);

  if (!brand) {
    return (
      <AppShell>
        <div className="p-8">
          <EmptyState
            title="No brand selected"
            description="Set up your brand first. Brandly uses it to write posts that sound like you."
            action={
              <Link href="/onboarding">
                <Button>Set up your brand</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const editing = !!post || generating;

  const optionsBlock = (
    <div className="space-y-5 text-left">
      <div>
        <SectionLabel>Content Template</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTENT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`p-3 rounded-xl text-left transition-all border text-xs ${selectedTemplate === t.id ? "bg-accent/10 border-accent/40 text-text" : "border-border text-text-muted hover:border-accent/30 hover:text-text"}`}
            >
              <span className="block mb-1.5"><TemplateIcon id={t.id} /></span>
              <span className="font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Platforms</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium border transition-all ${selectedPlatforms.includes(p) ? "bg-accent/10 border-accent/40 text-text" : "border-border text-text-muted hover:border-accent/30"}`}
            >
              <span><PlatformIcon platform={p} /></span>
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Tone Override</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${tone === t ? "bg-accent/10 border-accent/40 text-accent-light" : "border-border text-text-muted hover:border-accent/30 hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <Textarea label="Additional Context" placeholder="Any specific details, promotions, or angles to include…" value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)} rows={3} />

      {productPhotos.length >= 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Product carousel</SectionLabel>
            <button
              role="switch"
              aria-checked={carouselOn}
              onClick={() => setCarouselOn((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full border ${carouselOn ? "bg-accent/10 border-accent/40 text-accent-light" : "border-border text-text-muted hover:text-text"}`}
            >
              {carouselOn ? "On" : "Off"}
            </button>
          </div>
          {carouselOn && (
            <>
              <p className="text-xs text-text-muted">Cover, one slide per product, then a call to action. Up to {MAX_CAROUSEL_PRODUCTS} products each.</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {productPhotos.map((p) => {
                  const on = picked.includes(p.path);
                  return (
                    <button
                      key={p.path}
                      aria-pressed={on}
                      onClick={() => togglePicked(p.path)}
                      title={p.product?.name}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 ${on ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
                    >
                      {thumbs[p.path] && <img src={thumbs[p.path]} alt={p.product?.name ?? "Product"} className="w-full h-full object-cover" />}
                      {on && <span className="absolute top-1 left-1 text-[10px] font-semibold bg-accent text-bg rounded px-1.5">{picked.indexOf(p.path) + 1}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted">
                {picked.length === 0 ? "Tap the products to include." : batches.length > 1 ? `${picked.length} products make ${batches.length} carousels. Write the first, then use Next carousel.` : `${picked.length} selected.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        {!editing && (
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <PageHeader title="What do you want to post?" subtitle={`Creating content for ${brand.name}`} />
            <Textarea
              label="Describe the post you want"
              placeholder="e.g. Announce our new monsoon blend and why it's perfect for rainy mornings"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="secondary" loading={ideasLoading} onClick={suggestIdeas}>Suggest ideas</Button>
              <Button disabled={selectedPlatforms.length === 0} onClick={() => generate()}>Write post</Button>
            </div>
            {selectedPlatforms.length === 0 && <p className="text-xs text-text-muted">Pick at least one platform in Options.</p>}
            {genError && <p className="text-sm text-error">{genError}</p>}
            {ideasError && <p className="text-sm text-error">{ideasError}</p>}
            <div>
              <button aria-expanded={optionsOpen} onClick={() => setOptionsOpen((o) => !o)} className="text-xs text-text-muted hover:text-text underline">
                {optionsOpen ? "Hide options" : "Options: template, platforms, tone, product carousel"}
              </button>
            </div>
            {optionsOpen && <Card className="p-5">{optionsBlock}</Card>}
            {(ideasLoading || ideas.length > 0) && (
              <div className="space-y-3 text-left">
                <SectionLabel>Based on your brand</SectionLabel>
                <IdeaCards ideas={ideas} loading={ideasLoading} disabled={selectedPlatforms.length === 0} onPick={pickIdea} />
              </div>
            )}
          </div>
        )}

        {editing && (
          <div>
            <button onClick={backToIdeas} disabled={generating} className="text-xs text-text-muted hover:text-text mb-4">← Back to ideas</button>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left: phone preview */}
              <div className="lg:col-span-3 space-y-4">
                {generating && (
                  <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
                    <div className="w-full max-w-sm space-y-3" aria-hidden>
                      <div className="aspect-square rounded-xl bg-text/5 animate-pulse" />
                      <div className="h-3 rounded bg-text/5 animate-pulse" />
                      <div className="h-3 w-2/3 rounded bg-text/5 animate-pulse" />
                    </div>
                    <p className="text-sm text-text-muted">Writing for {selectedPlatforms.join(", ")} in {brand.name}&apos;s voice…</p>
                  </div>
                )}
                {post && !generating && (
                  <>
                    <PhoneFrame>
                      <PlatformPreview post={post} platforms={selectedPlatforms} brandDNA={brand.dna} igHandle={brand.sources.instagram} images={rendered?.urls ?? []} imageLoading={rendering} />
                    </PhoneFrame>
                    {renderError && <p className="text-xs text-error text-center">{renderError}</p>}
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button variant="secondary" onClick={() => generate()}>Regenerate</Button>
                      {isProductPost && batch + 1 < batches.length && (
                        <Button variant="secondary" onClick={nextCarousel}>Next carousel ({batch + 2} of {batches.length}) →</Button>
                      )}
                    </div>
                    {generationId && (
                      <div className="max-w-[380px] mx-auto">
                        {feedbackSent ? (
                          <p className="text-sm text-text-muted text-center">Thanks. This helps Brandly write better posts for you.</p>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <span className="text-sm flex-1">Is this post on-brand?</span>
                              <Button size="sm" variant={rating === 1 ? "primary" : "secondary"} aria-pressed={rating === 1} onClick={() => {
                                setRating(1);
                                sendFeedback({ generationId, rating: 1 }).then(() => setFeedbackSent(true)).catch(() => undefined);
                              }}>Yes</Button>
                              <Button size="sm" variant={rating === -1 ? "primary" : "secondary"} aria-pressed={rating === -1} onClick={() => setRating(-1)}>Not quite</Button>
                            </div>
                            {rating === -1 && (
                              <div className="mt-4 space-y-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {BAD_REASONS.map((r) => (
                                    <button
                                      key={r}
                                      aria-pressed={reasons.includes(r)}
                                      onClick={() => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
                                      className={`text-xs px-3 py-1.5 rounded-full border ${reasons.includes(r) ? "bg-text text-bg border-text" : "border-border text-text-muted hover:text-text"}`}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>
                                <Button size="sm" onClick={() => sendFeedback({ generationId, rating: -1, reasons }).then(() => setFeedbackSent(true)).catch(() => undefined)}>Send</Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                {!post && !generating && genError && <p className="text-sm text-error text-center">{genError}</p>}
              </div>

              {/* Right: edit panel */}
              {post && !generating && (
                <div className="lg:col-span-2 space-y-3">
                  <EditSection title="Image" defaultOpen>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Size</span>
                      <div className="flex gap-1" role="group" aria-label="Image size">
                        {(["1080x1350", "1080x1080"] as const).map((sz) => (
                          <button
                            key={sz}
                            aria-pressed={size === sz}
                            onClick={() => {
                              setSize(sz);
                              renderPreview(post, { size: sz, photo: currentPhoto() });
                            }}
                            className={`text-xs px-3 py-1 rounded-full border ${size === sz ? "bg-accent/10 border-accent/40 text-accent-light" : "border-border text-text-muted hover:text-text"}`}
                          >
                            {sz === "1080x1350" ? "4:5" : "1:1"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {kit && !isProductPost && (
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layout">
                        {kit.layouts
                          .filter((l) => l !== "carousel-cover" || (post.slides?.length ?? 0) >= 2)
                          .map((l) => (
                            <button
                              key={l}
                              aria-pressed={(rendered?.layout ?? post.layout) === l}
                              onClick={() => switchLayout(l)}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${(rendered?.layout ?? post.layout) === l ? "bg-text text-bg border-text" : "border-border text-text-muted hover:text-text"}`}
                            >
                              {LAYOUT_LABELS[l]}
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap items-center">
                      {brandPhotos.length > 0 && !isProductPost && (
                        <Button size="sm" variant="secondary" disabled={rendering} onClick={nextBrandPhoto}>Use a brand photo</Button>
                      )}
                      {!isProductPost && (
                        <Button size="sm" variant="secondary" disabled={rendering} onClick={() => renderPreview(post, { photo: "generate" })}>New AI photo</Button>
                      )}
                      {rendering && <span className="text-xs text-text-muted">Laying out your post…</span>}
                    </div>
                    {post.imagePrompt && (
                      <details className="text-xs text-text-muted">
                        <summary className="cursor-pointer">Photo brief</summary>
                        <p className="mt-2 leading-relaxed">{post.imagePrompt}</p>
                      </details>
                    )}
                  </EditSection>

                  <EditSection title="Headline" defaultOpen>
                    <Input label="Headline on the image" value={post.headline ?? ""} onChange={(e) => editVisualText("headline", e.target.value)} />
                  </EditSection>

                  <EditSection title="Supporting line" shown={show.subline} onToggle={(v) => toggleShow("subline", v)}>
                    <Input label="Supporting line" value={post.subline ?? ""} onChange={(e) => editVisualText("subline", e.target.value)} />
                  </EditSection>

                  <EditSection title="Caption and hashtags">
                    <Textarea label="Caption" value={post.caption} rows={6} onChange={(e) => setPost({ ...post, caption: e.target.value })} />
                    <div className="flex flex-wrap gap-1.5">
                      {post.hashtags.map((h) => (
                        <Chip key={h} variant="neutral" className="text-[11px]">{h}</Chip>
                      ))}
                    </div>
                    {selectedPlatforms.length > 1 &&
                      selectedPlatforms.map((p) => (
                        <div key={p}>
                          <p className="text-xs font-semibold text-text-muted mb-1">{PLATFORM_LABELS[p]}</p>
                          <p className="text-xs leading-relaxed bg-surface p-3 rounded-xl">{post.platformVariants?.[p] ?? post.caption}</p>
                        </div>
                      ))}
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-text-muted">Post type</span><span>{post.postType}</span></div>
                      <div className="flex justify-between"><span className="text-text-muted">Best time</span><span>{post.bestTimeToPost}</span></div>
                    </div>
                  </EditSection>

                  <EditSection title="Call to action" shown={show.cta} onToggle={(v) => toggleShow("cta", v)} />
                  <EditSection title="Logo" shown={show.logo} onToggle={(v) => toggleShow("logo", v)} />

                  {post.check && (
                    <EditSection title="Check">
                      <Scorecard check={post.check} text={[post.headline, post.caption].filter(Boolean).join("\n")} />
                    </EditSection>
                  )}

                  <EditSection title="Schedule or save" defaultOpen>
                    <div>
                      <label className="block text-xs text-text-muted mb-1.5">Schedule Date &amp; Time</label>
                      <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => schedulePost("draft")} disabled={saved || saving}>Save Draft</Button>
                      <Button onClick={() => schedulePost("scheduled")} disabled={saved || saving} loading={saving}>{saved ? "Scheduled" : "Schedule Post"}</Button>
                    </div>
                  </EditSection>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
