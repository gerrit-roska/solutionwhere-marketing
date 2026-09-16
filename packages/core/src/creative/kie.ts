import { graphed } from "../marketing/graphed";

// Kie image models through Graphed Tools, adapted from the Loman reference
// (agents/loman/src/fb/kie-graphed.ts). Tool id is `kie:<model>`; the body is
// the model's createTask input object directly. Result URL spellings vary by
// vendor — extract every known one.

export interface KieImageInput {
  prompt: string;
  imageInput?: string[]; // reference URLs for img2img
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  outputFormat?: "png" | "jpg";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrap(body: unknown): Record<string, unknown> {
  const root = asRecord(body) ?? {};
  const data = asRecord(root.data);
  const rawJson = root.resultJson ?? data?.resultJson;
  if (typeof rawJson === "string" && rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // resultJson sometimes arrives already an object
    }
  }
  if (asRecord(rawJson)) return asRecord(rawJson)!;
  if (data && (data.resultUrls || data.resultUrl || data.imageUrl)) return data;
  return data ?? root;
}

export function extractKieUrls(body: unknown): string[] {
  const data = unwrap(body);
  for (const key of ["resultUrls", "imageUrls", "urls"]) {
    const values = data[key];
    if (Array.isArray(values) && values.length) {
      return values.map(String).filter(Boolean);
    }
  }
  for (const key of ["resultUrl", "imageUrl", "url"]) {
    if (data[key]) return [String(data[key])];
  }
  return [];
}

export async function renderImage(
  model: string,
  input: KieImageInput,
  timeoutSeconds = 300,
): Promise<string> {
  const toolId = model.startsWith("kie:") ? model : `kie:${model}`;
  // Kie field names differ by model: Nano Banana takes `image_input` and
  // `output_format`; GPT Image 2 takes `input_urls` (required for the
  // image-to-image tool) and has no `output_format`.
  const gptImage2 = toolId.includes("gpt-image-2");
  const body: Record<string, unknown> = { prompt: input.prompt };
  if (input.imageInput?.length) {
    body[gptImage2 ? "input_urls" : "image_input"] = input.imageInput;
  }
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  if (input.resolution) body.resolution = input.resolution;
  if (input.outputFormat && !gptImage2) body.output_format = input.outputFormat;

  const raw = await graphed.tools.run(toolId, body, {
    timeoutSeconds,
    pollMs: 5_000,
  });
  const url = extractKieUrls(raw)[0];
  if (!url) {
    throw new Error(
      `Kie result missing image url: ${JSON.stringify(raw).slice(0, 400)}`,
    );
  }
  return url;
}
