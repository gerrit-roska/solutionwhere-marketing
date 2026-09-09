import { Graphed } from "@graphed-inc/sdk";

// One shared Graphed client for warehouse queries, Tools runs, and the
// OpenRouter proxy. Constructed at import time; credentials are read at call
// time (injected in cloud and under `graphed dev run --`).
export const graphed = new Graphed();

/** OpenAI-compatible chat-completions call through the Graphed proxy. */
export async function chat(
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options: { temperature?: number } = {},
): Promise<string> {
  const response = await fetch(
    `${graphed.openRouter.baseUrl().replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphed.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, ...options }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `OpenRouter proxy call failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter proxy returned no content.");
  return content;
}
