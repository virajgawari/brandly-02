import { z } from "zod";

/** Fields an admin may change. Ranges match the CHECK constraints in 0009_agent.sql. */
export const ConfigPatchSchema = z
  .object({
    enabled: z.boolean(),
    window_days: z.number().int().min(7).max(365),
    min_sample: z.number().int().min(2).max(100),
    min_lift: z.number().min(0.05).max(3),
    engagement_weight: z.number().min(0).max(1),
    auto_apply: z.boolean(),
    use_llm: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Nothing to change.");

/** Owners and admins may use the admin console. */
export const isAdminRole = (role: string | null | undefined) => role === "owner" || role === "admin";

export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;
