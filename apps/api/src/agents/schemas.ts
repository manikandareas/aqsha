import { z } from "zod";

export const astraPlanSchema = z.object({
  summary: z.string(),
  research: z.array(z.string()),
  plan: z.array(z.string()),
  risks: z.array(z.string()),
  validation: z.array(z.string()),
});

export type AstraPlan = z.infer<typeof astraPlanSchema>;
