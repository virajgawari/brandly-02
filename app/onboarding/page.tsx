"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import clsx from "clsx";
import { Check, FileUp, RefreshCw, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { BUSINESS_MODELS, INDUSTRIES, PRIMARY_GOALS, type BusinessModel, type Industry, type PrimaryGoal } from "@/lib/brand/taxonomy";
import { BrandAssets, productsToPhotos, type LogoAsset, type ProductAsset } from "@/components/onboarding/BrandAssets";
import { ChipGroup, LiveFindings, OnboardingShell, Question, TierCards } from "@/components/onboarding/kit";
import { brandNameFromTitle, nameFromUrl } from "@/lib/brand/naming";
import { BrandPostPreview, PaletteStrip } from "@/components/brand/BrandPreview";
import { afterSync, useStore } from "@/lib/store";
import { track } from "@/lib/track";
import { emptyModel, AGE_GROUPS, MOMENTS, MOTIVATIONS, type Affluence, type AgeGroup, type BrandModel, type CityTier, type Gender, type Moment, type Motivation } from "@/lib/brand/model";
import { mergePatch } from "@/lib/brand/merge";
import { AFFLUENCE_OPTIONS, AGE_LABELS, CITY_TIER_LABELS, GENDER_OPTIONS, LANGUAGE_OPTIONS, MOMENT_LABELS, MOTIVATION_LABELS } from "@/lib/brand/audience";
import { scorePersonality, THIS_OR_THAT } from "@/lib/brand/personality";
import { directionToPatch } from "@/lib/brand/build";
import { imageFileToBase64, pdfToBase64Pages, runPipeline, runStage } from "@/lib/brand/client";
import type { Finding } from "@/lib/brand/stages/types";
import type { Direction } from "@/lib/brand/stages/directions";

type Door = "analyse" | "build" | "refine";
type Step =
  | "website" | "instagram" | "files" | "assets" | "name" | "reading" | "confirm"
  | "offering" | "business" | "markets"
  | "audience" | "why" | "personality" | "directions" | "finishing";

const INTERVIEW: Step[] = ["audience", "why", "personality", "directions"];
const BUILD_STEPS: Step[] = ["name", "offering", "business", "markets", ...INTERVIEW, "assets"];

interface Answers {
  offering: string;
  category: string;
  industry?: Industry;
  businessModel?: BusinessModel;
  primaryGoal?: PrimaryGoal;
  countries: string;
  cityTiers: CityTier[];
  languages: string[];
  gender: Gender[];
  ageGroups: AgeGroup[];
  affluence?: Affluence;
  motivations: Motivation[];
  moments: Moment[];
  competitors: string;
  personality: Record<string, "a" | "b" | undefined>;
}

const EMPTY_ANSWERS: Answers = {
  offering: "",
  category: "",
  countries: "India",
  cityTiers: [],
  languages: ["English"],
  gender: [],
  ageGroups: [],
  motivations: [],
  moments: [],
  competitors: "",
  personality: {},
};

export default function OnboardingPage() {
  const router = useRouter();
  const saveBrandModel = useStore((s) => s.saveBrandModel);

  const [step, setStep] = useState<Step>("website");
  const [door, setDoor] = useState<Door>("analyse");
  const [name, setName] = useState("");

  // Door A sources
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [igHandle, setIgHandle] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Uploaded before the brand exists, so the brand id is fixed up front.
  const [draftId] = useState(() => crypto.randomUUID());
  const [logo, setLogo] = useState<LogoAsset | null>(null);
  const [products, setProducts] = useState<ProductAsset[]>([]);

  // Running state
  const [findings, setFindings] = useState<Finding[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<BrandModel | null>(null);
  const [confirmName, setConfirmName] = useState("");

  // Door B answers + directions
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [directions, setDirections] = useState<Direction[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  // Deep link from Home: /onboarding?door=build jumps straight to the questionnaire.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("door") === "build") {
      setDoor("build");
      setStep("name");
    }
  }, []);
  // Funnel: which step people reach, and on which door.
  useEffect(() => {
    track("onboarding_step", { props: { step, door } });
  }, [step, door]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setAnswers((a) => ({ ...a, [k]: v }));

  // The steps this person will see. Without a website there is no title to read the name from, so we ask for it.
  const hasSite = !!websiteUrl.trim();
  const flow: Step[] =
    door === "build"
      ? BUILD_STEPS
      : [
          "website", "instagram", "files", "assets",
          ...(hasSite ? [] : (["name"] as Step[])),
          ...(door === "refine" ? INTERVIEW : []),
        ];
  const stepNo = flow.indexOf(step) + 1 || undefined;
  const goBack = (): (() => void) | undefined => {
    if (step === "audience" && door === "refine") return () => setStep("confirm");
    const i = flow.indexOf(step);
    if (i > 0) return () => setStep(flow[i - 1]);
    return step === "name" ? () => setStep("website") : undefined;
  };
  // Puts the uploaded logo and products on a model (keeps what is already there).
  const withAssets = useCallback(
    (m: BrandModel): BrandModel => {
      const have = m.expression.photos ?? [];
      const photos = [...have, ...productsToPhotos(products).filter((p) => !have.some((h) => h.path === p.path))];
      return { ...m, expression: { ...m.expression, ...(logo ? { logoPath: logo.path } : {}), photos } };
    },
    [logo, products]
  );
  const runName = name.trim() || nameFromUrl(websiteUrl);

  // ── Dropzone (PDF or screenshots) ────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => setFiles((f) => [...f, ...accepted].slice(0, 9)), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 9,
  });

  // ── Door A: read sources ────────────────────────────────────────────────
  const readBrand = async () => {
    setError(null);
    setFindings([]);
    setRunning(true);
    setStep("reading");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let images: string[] = [];
      let imageSource: "pdf" | "instagram" | "upload" = "upload";
      const pdf = files.find((f) => f.type === "application/pdf");
      const pics = files.filter((f) => f.type.startsWith("image/"));
      if (pdf) {
        setFindings([{ id: "prep", label: `Opening ${pdf.name}`, status: "info" }]);
        images = (await pdfToBase64Pages(pdf, 6)).images;
        imageSource = "pdf";
      }
      if (pics.length) {
        images = [...images, ...(await Promise.all(pics.slice(0, 8 - images.length).map((f) => imageFileToBase64(f))))];
        if (!pdf) imageSource = igHandle ? "instagram" : "upload";
      }
      const base = emptyModel(runName, door === "refine" ? "refine" : "analyse", draftId);
      if (logo) base.expression = { ...base.expression, logoPath: logo.path };
      const result = await runPipeline(
        "analyse",
        base,
        { websiteUrl: websiteUrl.trim() || undefined, igHandle: igHandle.trim() || undefined, images, imageSource, ...(logo ? { logoImage: logo.dataUri } : {}) },
        setFindings,
        controller.signal
      );
      setFindings(result.findings);
      setModel(withAssets(result.model));
      setRunning(false);
      // The name comes from the site's title; the owner confirms it on the next screen.
      const title = result.findings.find((f) => f.id === "site")?.detail;
      setConfirmName(name.trim() || (hasSite ? brandNameFromTitle(title, websiteUrl) : runName));
      setStep("confirm");
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // After the owner confirms the name: save the brand (analyse) or carry on to the interview (refine).
  const finishReading = () => {
    if (!model) return;
    const finalName = confirmName.trim() || runName;
    const confirmed: BrandModel = { ...model, name: finalName };
    setName(finalName);
    setModel(confirmed);
    if (door === "refine") {
      // Prefill the interview with what we found, then continue the Build path.
      const a = confirmed.strategy.audience;
      setAnswers((prev) => ({
        ...prev,
        offering: confirmed.strategy.offering,
        category: confirmed.strategy.category,
        industry: confirmed.strategy.industry,
        businessModel: confirmed.strategy.businessModel,
        primaryGoal: confirmed.strategy.primaryGoal,
        gender: a.gender ? [a.gender] : [],
        ageGroups: a.ageGroups,
        affluence: a.affluence,
        languages: a.languages.length ? a.languages : prev.languages,
        cityTiers: a.markets.cityTiers,
        motivations: a.motivations,
        moments: a.moments,
      }));
      setStep("audience");
      return;
    }
    const pdf = files.find((f) => f.type === "application/pdf");
    saveBrandModel(
      confirmed,
      { website: websiteUrl.trim() || undefined, instagram: igHandle.trim() || undefined, pdfName: pdf?.name },
      { source: "stage", stageId: "pipeline:analyse" }
    );
    router.push("/brand?welcome=1");
  };

  // ── Door B: answers → model ─────────────────────────────────────────────
  const modelFromAnswers = useCallback((): BrandModel => {
    const base = model ?? emptyModel(name.trim(), door === "refine" ? "refine" : "build", draftId);
    const countries = answers.countries.split(",").map((c) => c.trim()).filter(Boolean);
    return mergePatch(
      base,
      {
        name: name.trim(),
        strategy: {
          offering: answers.offering,
          category: answers.category,
          industry: answers.industry,
          businessModel: answers.businessModel,
          primaryGoal: answers.primaryGoal,
          competitors: answers.competitors.split(",").map((c) => c.trim()).filter(Boolean),
          audience: {
            gender: answers.gender[0],
            ageGroups: answers.ageGroups,
            affluence: answers.affluence,
            markets: { countries, cityTiers: answers.cityTiers },
            languages: answers.languages,
            motivations: answers.motivations,
            moments: answers.moments,
          },
        },
        personality: scorePersonality(answers.personality),
      },
      { source: "user", confidence: 1 }
    ).model;
  }, [answers, door, model, name, draftId]);

  const designDirections = async (nextSeed = seed) => {
    setError(null);
    setDirections(null);
    setPicked(null);
    setStep("directions");
    setRunning(true);
    try {
      const m = modelFromAnswers();
      const res = await runStage("directions", m, { seed: nextSeed });
      setDirections((res.output.directions as Direction[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRunning(false);
  };

  const finishBuild = async () => {
    const d = directions?.find((x) => x.id === picked);
    if (!d) return;
    setError(null);
    setStep("finishing");
    setRunning(true);
    setFindings([]);
    try {
      const withAnswers = modelFromAnswers();
      const chosen = mergePatch(withAnswers, directionToPatch(d), { source: "user", confidence: 1 }).model;
      const result = await runPipeline("build", door === "build" ? withAssets(chosen) : chosen, {}, setFindings);
      saveBrandModel(result.model, door === "refine" ? { website: websiteUrl.trim() || undefined, instagram: igHandle.trim() || undefined } : {}, { source: "build" });
      // Every direction shown + the one picked: preference data for improving directions later.
      const brandId = result.model.id;
      afterSync(brandId).then(() =>
        fetch("/api/build-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, answers, directions, selectedIndex: directions?.findIndex((x) => x.id === d.id) ?? null }),
          keepalive: true,
        }).catch(() => undefined)
      );
      router.push("/brand?welcome=1");
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const canRead = !!(hasSite || igHandle.trim() || files.length);
  const personalityAnswered = useMemo(() => Object.values(answers.personality).filter(Boolean).length, [answers.personality]);

  // ── Screens ──────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {step === "website" && (
        <OnboardingShell
          hero
          title="What's your website?"
          subtitle="Brandly reads it to learn your colours, fonts, logo and how you write."
          primary={{ label: "Continue", onClick: () => setStep("instagram"), disabled: !hasSite }}
        >
          <Input
            aria-label="Website"
            className="h-14 text-base text-center"
            placeholder="yourbrand.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            inputMode="url"
            autoFocus
          />
          <div className="mt-4 flex justify-center text-sm text-text-muted">
            <button
              onClick={() => setDoor(door === "refine" ? "analyse" : "refine")}
              aria-pressed={door === "refine"}
              className={clsx("underline-offset-4 hover:underline", door === "refine" && "text-text font-medium")}
            >
              {door === "refine" && <Check size={14} className="inline mr-1 -mt-0.5" />}I have a website, but no real brand yet
            </button>
          </div>
          <p className="mt-8 mb-3 text-xs text-text-muted text-center">No website?</p>
          <div className="grid sm:grid-cols-2 gap-3 text-left">
            <button
              onClick={() => { setWebsiteUrl(""); setDoor("analyse"); setStep("instagram"); }}
              className="rounded-2xl border border-border bg-card p-4 hover:border-text/30 transition-colors"
            >
              <p className="font-medium text-sm">Use Instagram or files</p>
              <p className="text-xs text-text-muted mt-1">Add your handle or screenshots and we learn from those.</p>
            </button>
            <button
              onClick={() => { setDoor("build"); setStep("name"); }}
              className="rounded-2xl border border-border bg-card p-4 hover:border-text/30 transition-colors"
            >
              <p className="font-medium text-sm">Start from scratch</p>
              <p className="text-xs text-text-muted mt-1">Answer a few questions and pick one of three directions.</p>
            </button>
          </div>
        </OnboardingShell>
      )}

      {step === "instagram" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Got an Instagram?"
          subtitle="Optional. We note your handle; screenshots on the next step let us study your posts."
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("files") }}
          secondary={{ label: "Skip", onClick: () => setStep("files") }}
        >
          <Input label="Instagram handle" placeholder="yourbrand" prefix="@" value={igHandle} onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))} autoFocus />
        </OnboardingShell>
      )}

      {step === "files" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Add a catalogue or post screenshots?"
          subtitle={hasSite ? "Optional. 4–6 screenshots of your grid help a lot." : "Add at least one file, or go back and add a website or handle."}
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("assets"), disabled: !canRead }}
          secondary={hasSite && !files.length ? { label: "Skip", onClick: () => setStep("assets") } : undefined}
        >
          <div
            {...getRootProps()}
            className={clsx(
              "rounded-xl border border-dashed p-8 text-center cursor-pointer transition-colors",
              isDragActive ? "border-text bg-text/[0.03]" : "border-border hover:border-text/30"
            )}
          >
            <input {...getInputProps()} />
            <FileUp size={20} className="mx-auto text-text-muted" />
            <p className="text-sm mt-2">Drop files here or click to choose</p>
            <p className="text-xs text-text-muted mt-0.5">PDF, PNG or JPG. Up to 9 files.</p>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm bg-card border border-border rounded-lg px-3 h-9">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-text-muted hover:text-text">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OnboardingShell>
      )}

      {step === "assets" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Add your logo and products"
          subtitle="Optional. Your logo sets the starting colours, and product photos are used in posts instead of AI images."
          onBack={goBack()}
          primary={
            door === "build"
              ? { label: "Set up my brand", onClick: finishBuild }
              : hasSite
                ? { label: "Read my brand", onClick: readBrand }
                : { label: "Continue", onClick: () => setStep("name") }
          }
          secondary={
            logo || products.length
              ? undefined
              : { label: "Skip", onClick: door === "build" ? finishBuild : hasSite ? readBrand : () => setStep("name") }
          }
        >
          <BrandAssets brandId={draftId} logo={logo} onLogo={setLogo} products={products} onProducts={setProducts} />
        </OnboardingShell>
      )}

      {step === "name" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="What's your brand called?"
          onBack={goBack()}
          primary={
            door === "build"
              ? { label: "Continue", onClick: () => setStep("offering"), disabled: !name.trim() }
              : { label: "Read my brand", onClick: readBrand, disabled: !name.trim() || !canRead }
          }
        >
          <Input aria-label="Brand name" placeholder="e.g. Chai Point" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </OnboardingShell>
      )}

      {step === "reading" && (
        <OnboardingShell
          title={running ? `Reading ${runName || "your brand"}` : error ? "That didn't work" : "Done"}
          subtitle={running ? "This takes about 20–40 seconds. Here's what we've found so far." : undefined}
          onBack={running ? undefined : () => setStep(hasSite ? "assets" : "name")}
          primary={error ? { label: "Try again", onClick: readBrand } : undefined}
        >
          <LiveFindings findings={findings} running={running} />
          {error && <p className="mt-4 text-sm text-error">{error}</p>}
        </OnboardingShell>
      )}

      {step === "confirm" && (
        <OnboardingShell
          title="Is this your brand?"
          subtitle="Here's what we found. You can change anything later."
          primary={{ label: "Looks right", onClick: finishReading, disabled: !confirmName.trim() }}
        >
          <Input label="Brand name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoFocus />
          {model && (
            <div className="mt-6 space-y-3">
              {model.expression.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={model.expression.logoUrl} alt="Your logo" className="h-12 w-auto max-w-[200px] object-contain" />
              )}
              <PaletteStrip
                palette={{
                  primary: model.expression.tokens.color.primary.$value,
                  secondary: model.expression.tokens.color.secondary.$value,
                  accent: model.expression.tokens.color.accent.$value,
                  neutral: model.expression.tokens.color.neutral.$value,
                }}
              />
              {model.identity.oneLiner && <p className="text-sm text-text-muted">{model.identity.oneLiner}</p>}
            </div>
          )}
        </OnboardingShell>
      )}

      {step === "offering" && (
        <OnboardingShell step={stepNo} total={flow.length} title="What do you sell?" onBack={goBack()} primary={{ label: "Continue", onClick: () => setStep("business"), disabled: !answers.offering.trim() }}>
          <Question title="In plain words" hint="e.g. “Handmade soy candles and gift boxes”">
            <Textarea rows={3} value={answers.offering} onChange={(e) => set("offering", e.target.value)} placeholder="We sell…" autoFocus />
          </Question>
        </OnboardingShell>
      )}

      {step === "business" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="How does your business work?"
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("markets") }}
          secondary={{ label: "Skip", onClick: () => setStep("markets") }}
        >
          <Question title="Which industry fits best?">
            <Select options={INDUSTRIES} value={answers.industry ?? ""} onChange={(v) => set("industry", (v || undefined) as Industry | undefined)} />
          </Question>
          <Question title="How do you sell?">
            <Select options={BUSINESS_MODELS} value={answers.businessModel ?? ""} onChange={(v) => set("businessModel", (v || undefined) as BusinessModel | undefined)} />
          </Question>
          <Question title="What do you want social media to do for you most?">
            <Select options={PRIMARY_GOALS} value={answers.primaryGoal ?? ""} onChange={(v) => set("primaryGoal", (v || undefined) as PrimaryGoal | undefined)} />
          </Question>
        </OnboardingShell>
      )}

      {step === "markets" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Where are your customers?"
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("audience") }}
          secondary={{ label: "Skip", onClick: () => setStep("audience") }}
        >
          <Question title="Which country or countries?">
            <Input value={answers.countries} onChange={(e) => set("countries", e.target.value)} placeholder="India" />
          </Question>
          <Question title="Where are most customers?" hint="Pick all that apply">
            <ChipGroup
              multi
              options={(Object.keys(CITY_TIER_LABELS) as CityTier[]).map((v) => ({ value: v, label: CITY_TIER_LABELS[v] }))}
              value={answers.cityTiers}
              onChange={(v) => set("cityTiers", v)}
            />
          </Question>
          <Question title="Which language should posts be in?" hint="Pick all that apply">
            <ChipGroup multi options={LANGUAGE_OPTIONS.map((l) => ({ value: l, label: l }))} value={answers.languages} onChange={(v) => set("languages", v)} />
          </Question>
        </OnboardingShell>
      )}

      {step === "audience" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Who buys from you?"
          subtitle={door === "refine" ? "We guessed from your website. Fix anything that's off." : "This shapes your colours, voice and where you post."}
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("why") }}
          secondary={{ label: "Not sure, let Brandly suggest", onClick: () => setStep("why") }}
        >
          <Question title="Mostly…">
            <ChipGroup options={GENDER_OPTIONS} value={answers.gender} onChange={(v) => set("gender", v)} />
          </Question>
          <Question title="Which age groups?" hint="Pick all that apply">
            <ChipGroup multi options={AGE_GROUPS.map((a) => ({ value: a, label: AGE_LABELS[a] }))} value={answers.ageGroups} onChange={(v) => set("ageGroups", v)} />
          </Question>
          <Question title="How do your customers spend?">
            <TierCards options={AFFLUENCE_OPTIONS} value={answers.affluence} onChange={(v) => set("affluence", v)} />
          </Question>
        </OnboardingShell>
      )}

      {step === "why" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Why and when do people buy?"
          onBack={goBack()}
          primary={{ label: "Continue", onClick: () => setStep("personality") }}
          secondary={{ label: "Not sure, let Brandly suggest", onClick: () => setStep("personality") }}
        >
          <Question title="Why do they buy from you?" hint="Pick up to 2">
            <ChipGroup multi max={2} options={MOTIVATIONS.map((m) => ({ value: m, label: MOTIVATION_LABELS[m] }))} value={answers.motivations} onChange={(v) => set("motivations", v)} />
          </Question>
          <Question title="When do they think of you?" hint="Pick all that apply">
            <ChipGroup multi options={MOMENTS.map((m) => ({ value: m, label: MOMENT_LABELS[m] }))} value={answers.moments} onChange={(v) => set("moments", v)} />
          </Question>
          <Question title="Brands you admire or compete with" hint="Optional. Separate with commas.">
            <Input value={answers.competitors} onChange={(e) => set("competitors", e.target.value)} placeholder="e.g. Chaayos, Blue Tokai" />
          </Question>
        </OnboardingShell>
      )}

      {step === "personality" && (
        <OnboardingShell
          step={stepNo}
          total={flow.length}
          title="Pick the one that's more you"
          subtitle="Go with your gut. Skip any that don't fit."
          onBack={() => setStep("why")}
          primary={{ label: "Show me directions", onClick: () => designDirections(), disabled: personalityAnswered < 3 }}
        >
          <div className="space-y-6">
            {THIS_OR_THAT.map((pair) => (
              <div key={pair.id}>
                <p className="text-sm font-medium mb-2">{pair.question}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["a", "b"] as const).map((side) => {
                    const opt = pair[side];
                    const on = answers.personality[pair.id] === side;
                    return (
                      <button
                        key={side}
                        onClick={() => set("personality", { ...answers.personality, [pair.id]: on ? undefined : side })}
                        aria-pressed={on}
                        className={clsx(
                          "text-left rounded-xl border p-3.5 transition-colors bg-card",
                          on ? "border-text ring-1 ring-text" : "border-border hover:border-text/30"
                        )}
                      >
                        <span className="block text-sm font-medium">{opt.label}</span>
                        <span className="block text-xs text-text-muted mt-1">{opt.example}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {personalityAnswered < 3 && <p className="mt-6 text-xs text-text-muted">Answer at least 3 to continue.</p>}
        </OnboardingShell>
      )}

      {step === "directions" && (
        <OnboardingShell
          wide
          step={stepNo}
          total={flow.length}
          title="Pick a starting direction"
          subtitle="You can change colours, fonts and voice afterwards."
          onBack={() => setStep("personality")}
          primary={directions ? { label: "Use this direction", onClick: door === "build" ? () => setStep("assets") : finishBuild, disabled: !picked } : undefined}
          secondary={
            directions
              ? {
                  label: "Show me three different ones",
                  onClick: () => {
                    setSeed((s) => s + 1);
                    designDirections(seed + 1);
                  },
                }
              : undefined
          }
        >
          {running && !directions && (
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="h-10 rounded-lg bg-text/5 animate-pulse" />
                  <div className="aspect-square rounded-xl bg-text/5 animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-text/5 animate-pulse" />
                </div>
              ))}
              <p className="sm:col-span-3 text-sm text-text-muted">Designing three directions. About 15 seconds.</p>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-error/30 p-4 text-sm">
              <p className="text-error">{error}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => designDirections()}>
                <RefreshCw size={14} /> Try again
              </Button>
            </div>
          )}
          {directions && (
            <div className="grid gap-4 sm:grid-cols-3">
              {directions.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setPicked(d.id)}
                  aria-pressed={picked === d.id}
                  className={clsx(
                    "text-left rounded-2xl border bg-card p-4 transition-colors flex flex-col gap-3",
                    picked === d.id ? "border-text ring-1 ring-text" : "border-border hover:border-text/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">{d.words.join(" · ")}</p>
                    </div>
                    <span className={clsx("w-5 h-5 rounded-full border grid place-items-center shrink-0", picked === d.id ? "bg-text border-text text-bg" : "border-border")}>
                      {picked === d.id && <Check size={12} strokeWidth={3} />}
                    </span>
                  </div>
                  <PaletteStrip palette={d.palette} />
                  <BrandPostPreview name={name} headline={d.oneLiner || name} caption={d.sampleCaption} palette={d.palette} fonts={d.fonts} variant={i} />
                  <p className="text-xs text-text-muted">
                    {d.fonts.heading} + {d.fonts.body}
                  </p>
                  <ul className="space-y-1.5">
                    {d.sampleLines.map((l, j) => (
                      <li key={j} className="text-sm leading-snug">
                        “{l}”
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          )}
        </OnboardingShell>
      )}

      {step === "finishing" && (
        <OnboardingShell title="Setting up your brand" subtitle="Planning what to post about and checking your colours." onBack={error ? () => setStep(door === "build" ? "assets" : "directions") : undefined}>
          <LiveFindings findings={findings} running={running} />
          {error && <p className="mt-4 text-sm text-error">{error}</p>}
        </OnboardingShell>
      )}
    </AppShell>
  );
}
