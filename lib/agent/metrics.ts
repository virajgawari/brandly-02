import { z } from "zod";

export const PLATFORMS = ["instagram", "facebook", "linkedin", "twitter"] as const;

const Count = z.number().int().min(0).max(1_000_000_000).nullable().optional();

/** Numbers a person types in from a platform's insights screen. Blank fields are left out. */
export const ManualMetricsSchema = z
  .object({
    platform: z.enum(PLATFORMS),
    impressions: Count,
    reach: Count,
    likes: Count,
    comments: Count,
    shares: Count,
    saves: Count,
    clicks: Count,
  })
  .strict()
  .refine((m) => (m.reach ?? m.impressions ?? 0) > 0, "Enter reach or impressions so engagement can be worked out.")
  .refine((m) => [m.likes, m.comments, m.shares, m.saves].some((n) => n != null), "Enter at least one of likes, comments, shares or saves.");

export type ManualMetrics = z.infer<typeof ManualMetricsSchema>;
