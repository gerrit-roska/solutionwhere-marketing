import { z } from "zod";
import { envSlice } from "../config";

// Client Instantly workspace key (docs/07 sequencerEnv). This is the
// Solutionwhere Hyper Growth workspace, stored as a Graphed project secret —
// not a Graphed Tools vendor proxy. Catalog coverage for Instantly is still
// missing; file graphed feedback rather than adding a second key.

const sequencerEnvSchema = z.object({
  INSTANTLY_API_KEY: z
    .string({ required_error: "INSTANTLY_API_KEY is not set — graphed secrets / graphed dev run" })
    .min(1),
});

export type SequencerEnv = z.infer<typeof sequencerEnvSchema>;

let cached: SequencerEnv | null = null;

export function sequencerEnv(): SequencerEnv {
  cached ??= envSlice(sequencerEnvSchema);
  return cached;
}
