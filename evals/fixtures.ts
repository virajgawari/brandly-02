import { emptyModel, type BrandModel } from "@/lib/brand/model";
import { mergePatch } from "@/lib/brand/merge";

/** Fixed brands for replaying briefs. Fictional, so evals never touch real customer data. */
function make(id: string, name: string, patch: Parameters<typeof mergePatch>[1]): BrandModel {
  return mergePatch(emptyModel(name, "build", id), patch, { source: "user", confidence: 1 }).model;
}

export const BRANDS: Record<string, BrandModel> = {
  wick: make("00000000-0000-4000-8000-0000000e0001", "Wick & Ember", {
    strategy: {
      category: "home fragrance",
      industry: "home_decor",
      businessModel: "d2c_ecommerce",
      primaryGoal: "sales",
      offering: "Hand-poured soy candles and gift boxes",
      promise: "Slow evenings, made small-batch in Pune",
      differentiators: ["cotton wicks", "refillable glass jars"],
      audience: {
        gender: "women",
        ageGroups: ["25-34"],
        languages: ["English"],
        markets: { countries: ["India"], cityTiers: ["metro"] },
        psychographic: "Likes quiet routines, gifts with thought behind them",
      },
    },
    identity: { oneLiner: "Small-batch soy candles for slow evenings" },
    voice: {
      description: "Warm and plain. Short sentences, sensory detail, never salesy.",
      vocabulary: { use: ["burn time", "small batch", "pour"], avoid: ["luxurious", "elevate", "game-changer"] },
      sampleLines: ["Lit at 7, still going at 11.", "Cedar, a little smoke, and the end of a long week."],
    },
    content: { vibe: ["warm", "calm", "handmade", "quiet"], pillars: ["process", "scent notes", "gifting", "evening rituals"], hashtagClusters: ["#soycandles", "#smallbatch", "#slowliving"] },
  }),
  physio: make("00000000-0000-4000-8000-0000000e0002", "Mehta Physio Clinic", {
    strategy: {
      category: "physiotherapy",
      industry: "health_wellness",
      businessModel: "local_store",
      primaryGoal: "footfall",
      offering: "Physiotherapy and sports injury rehab in Nashik",
      promise: "Back to your routine, with a plan you can follow at home",
      differentiators: ["one-to-one sessions", "home exercise plans"],
      audience: {
        gender: "all",
        ageGroups: ["25-34", "35-44", "45-54"],
        languages: ["English", "Hinglish"],
        markets: { countries: ["India"], cityTiers: ["tier2"] },
        psychographic: "Desk workers and weekend runners who put off pain until it stops them",
      },
    },
    identity: { oneLiner: "Practical physio for desk workers and weekend athletes" },
    voice: {
      description: "Calm, clear and reassuring. Explains in plain words, no jargon.",
      vocabulary: { use: ["rehab", "mobility", "home plan"], avoid: ["miracle", "cure-all", "revolutionary"] },
      sampleLines: ["Neck pain after 8 hours at a desk? Start with these two stretches.", "Recovery is mostly small habits."],
    },
    content: { vibe: ["trustworthy", "practical", "calm"], pillars: ["desk posture", "injury myths", "patient stories", "home exercises"], hashtagClusters: ["#physiotherapy", "#nashik", "#backpain"] },
  }),
};
