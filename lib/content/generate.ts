import "server-only";
import type { BrandModel } from "@/lib/brand/model";
import { GeneratedPostSchema } from "@/lib/brand/schemas";
import { generateStructured } from "@/lib/llm";
import { lastLlmCallId } from "@/lib/llm-log";
import { llmScope } from "@/lib/db/llm-scope";
import { optionalSession } from "@/lib/db/session";
import { n8nEnabled, n8nRequest, type N8nRoute } from "@/lib/n8n";
import { layoutKitOf } from "@/lib/render/kit";
import type { BrandDNA, GeneratedPost, Platform, ProductRef, TemplateCategory } from "@/lib/types";
import { judgeFit, JUDGE_VERSION, NOTABLE_GAP, type FitCheck } from "@/lib/judge/fit";
import { checkRules, type RuleCheck } from "@/lib/judge/rules";
import { PLATFORM_LIMITS } from "@/lib/templates";
import { chooseLayout, pickBrief, type PostBrief } from "./brief";
import { recentPosts } from "./history";
import { hashtagRange } from "./hashtags";
import { bannedWords, buildPostPrompt, buildRevisePrompt, finalizePost, postSchemaFor, POST_PROMPT_VERSION, POST_TEMPERATURE } from "./prompt";

export interface GenerateInput {
  model?: BrandModel;
  dna?: BrandDNA;
  platforms: Platform[];
  template?: TemplateCategory;
  topic?: string;
  tone?: string;
  additionalContext?: string;
  triggerContext?: string;
  /** Product carousel: validated products in slide order. */
  products?: ProductRef[];
  /** One post about one chosen product: no carousel. */
  single?: boolean;
  /** Which feature the call is logged under. */
  feature: "generate-post" | "automation";
  /** Original request body, forwarded to n8n alongside the built prompt. */
  n8nBody?: Record<string, unknown>;
}

/** No revise pass after this long: the route allows 60 s and a revise plus its re-check can take 20 s. */
export const REVISE_DEADLINE_MS = 30_000;
/** Checks and the revise pass must be done this long after the request started (the route's limit is 60 s). */
export const HARD_DEADLINE_MS = 50_000;
/** Not worth starting a judge call with less than this left. */
const MIN_JUDGE_MS = 6_000;

const failuresOf = (rules: RuleCheck, fit: FitCheck): string[] => [
  ...rules.failures,
  ...(fit.status === "ok" && !fit.passed
    ? fit.facets
        .filter((f) => Math.abs(f.gap) > NOTABLE_GAP)
        .map((f) => `${f.facet}: post scores ${f.score}, the brand is ${f.target}${f.gap < 0 ? " (too low)" : " (too high)"}`)
    : []),
];

const textOf = (p: GeneratedPost) => [p.headline, p.caption].filter(Boolean).join("\n");

/** Rules (free) plus one judge call; one revise pass if either fails. Never throws, never fails generation. */
async function checkAndRevise(
  post: GeneratedPost,
  c: GenerateInput & { brief: PostBrief; prompt: { system: string; user: string; brandContext?: string }; started: number; opts?: Parameters<typeof generateStructured>[3] }
): Promise<GeneratedPost> {
  const { model, platforms } = c;
  const limits = Object.fromEntries(platforms.map((p) => [p, PLATFORM_LIMITS[p]]));
  const skipped: FitCheck = { status: "skipped", passed: true, facets: [], offFacets: [] };
  const left = () => HARD_DEADLINE_MS - (Date.now() - c.started);
  // Everything the model was allowed to know. Specifics in the post that are not in here count as invented.
  const facts = [c.prompt.brandContext ?? "", c.topic, c.additionalContext, c.triggerContext, ...(c.products ?? []).map((x) => `${x.name} ${x.note ?? ""}`)].filter(Boolean).join("\n");
  const check = async (p: GeneratedPost) => {
    const rules = checkRules(p, { banned: bannedWords(model), platforms, limits, facts, hashtags: hashtagRange(model) });
    // The judge tries Gemini first, which can be slow or out of quota; never let it use up the route's 60 s.
    const fit: FitCheck =
      model && left() > MIN_JUDGE_MS
        ? await Promise.race([
            llmScope("judge", { brandId: model.id }, () => judgeFit(textOf(p), model)),
            new Promise<FitCheck>((r) => setTimeout(() => r(skipped), left())),
          ])
        : skipped;
    return { rules, fit };
  };
  try {
    const first = await check(post);
    const ok = first.rules.passed && first.fit.passed;
    if (ok || !c.opts || Date.now() - c.started > REVISE_DEADLINE_MS) {
      return { ...post, check: { ...first, revised: false, version: JUDGE_VERSION, text: textOf(post) } };
    }
    const user = buildRevisePrompt(c.prompt.user, post, failuresOf(first.rules, first.fit));
    const first_ = { ...post, check: { ...first, revised: false, version: JUDGE_VERSION, text: textOf(post) } };
    // Same budget for the rewrite: if it can't finish in time, keep the first post with its check.
    const raw = await Promise.race([
      llmScope(c.feature, { brandId: model?.id, promptVersion: POST_PROMPT_VERSION }, () => generateStructured(postSchemaFor(model), c.prompt.system, user, c.opts!)),
      new Promise<null>((r) => setTimeout(() => r(null), Math.max(left() - MIN_JUDGE_MS, 0))),
    ]).catch(() => null);
    if (!raw) return first_;
    const next = finalizePost(raw, { model, dna: c.dna, brief: c.brief, platforms });
    if (!next) return { ...post, check: { ...first, revised: false, version: JUDGE_VERSION, text: textOf(post) } };
    const second = await check(next);
    const better =
      Number(second.rules.passed) !== Number(first.rules.passed)
        ? second.rules.passed
        : (second.fit.fit ?? 0) >= (first.fit.fit ?? 0);
    return better
      ? { ...next, check: { ...second, revised: true, version: JUDGE_VERSION, text: textOf(next) } }
      : { ...post, check: { ...first, revised: true, version: JUDGE_VERSION, text: textOf(post) } };
  } catch (e) {
    console.warn("[generate] check failed:", String(e instanceof Error ? e.message : e).slice(0, 160));
    return post;
  }
}

export type GenerateResult = { post: GeneratedPost; generationId?: string } | { error: string; status: number };

/**
 * Brief → prompt → LLM (or n8n) → validated post with a layout chosen.
 * The brief and history are decided here so n8n and the built-in path write the same kind of post.
 */
export async function generatePost(input: GenerateInput): Promise<GenerateResult> {
  const started = Date.now();
  const { model, dna, platforms } = input;
  const session = await optionalSession();
  const history = await recentPosts(model?.id, 15, session);
  const brief = pickBrief(model, history, input.template, {
    allowCarousel: !input.single && platforms.some((p) => p === "instagram" || p === "linkedin"),
    products: input.products,
    request: [input.topic, input.additionalContext, input.triggerContext].filter(Boolean).join(" "),
  });
  const prompt = buildPostPrompt({ ...input, brief, history });
  const llmOpts = { task: "fast" as const, maxTokens: 2200, cachedContext: prompt.brandContext, temperature: POST_TEMPERATURE };

  let raw: unknown;
  let generationId: string | undefined;
  if (n8nEnabled()) {
    const { status, data } = await n8nRequest(input.feature as N8nRoute, {
      ...(input.n8nBody ?? {}),
      brandContext: prompt.brandContext,
      prompt: { system: prompt.system, user: prompt.user, temperature: POST_TEMPERATURE },
    });
    if (status >= 400 || !data.post) return { error: String(data.error ?? `n8n responded with HTTP ${status}`), status: status >= 400 ? status : 502 };
    raw = data.post;
  } else {
    const opts = llmOpts;
    raw = await llmScope(input.feature, { brandId: model?.id, promptVersion: POST_PROMPT_VERSION }, async () => {
      try {
        return await generateStructured(postSchemaFor(model), prompt.system, prompt.user, opts);
      } catch {
        // Two replies still used a banned phrase: accept a valid post rather than fail.
        return await generateStructured(GeneratedPostSchema, prompt.system, prompt.user, opts);
      } finally {
        generationId = lastLlmCallId() ?? undefined;
      }
    });
  }

  let post = finalizePost(raw, { model, dna, brief, platforms });
  if (!post) return { error: "The AI reply did not match the expected format.", status: 502 };
  post = await checkAndRevise(post, { ...input, brief, prompt, started, opts: n8nEnabled() ? undefined : llmOpts });
  if (brief.products?.length) {
    post.layout = "product-cover";
    return { post, generationId };
  }
  const kit = layoutKitOf(model);
  if (kit) post.layout = chooseLayout(kit, post.format, history, { textOnImagePct: model?.expression.styleGuide?.textOnImagePct, carousel: brief.carousel && (post.slides?.length ?? 0) >= 2 });
  return { post, generationId };
}
