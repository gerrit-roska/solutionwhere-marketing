import { getDb } from "../db";
import { chat } from "./graphed";

// AEO prompt panel (05-seo-aeo-execution.md §6.7): the fixed 20 prompts a
// district administrator would ask an assistant, run monthly across a fixed
// model list through the Graphed OpenRouter proxy. perplexity/sonar-pro is
// the one model with live retrieval; the others measure model-weight
// presence. Chart them separately.

export const AEO_PROMPTS = [
  "What software do CCR&R agencies use to manage child care referrals?",
  "Best child care resource and referral software",
  "What software do school districts use to manage professional development?",
  "Professional development management software for school districts",
  "Alternatives to Frontline Professional Growth",
  "What replaced MyLearningPlan?",
  "Best instructional coaching software for K-12 districts",
  "Software for tracking instructional coaching cycles",
  "School enrollment and registration software for districts",
  "Best school choice lottery software",
  "How do districts run a defensible school choice lottery?",
  "What software do BOCES use for professional development?",
  "Professional development software for Michigan ISDs",
  "How do districts track Act 48 hours in Pennsylvania?",
  "Software for tracking SCECH in Michigan",
  "What is Wisdomwhere?",
  "What replaced CourseWhere?",
  "Software for early childhood coaching and technical assistance",
  "Enrollment software for pre-K programs",
  "Who are Solutionwhere's competitors?",
];

const MODELS = [
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4.5",
  "google/gemini-2.5-pro",
  "perplexity/sonar-pro",
];

const COMPETITOR_NAMES = [
  "Frontline",
  "MyLearningPlan",
  "Vector Solutions",
  "KickUp",
  "Kalpa",
  "escWorks",
  "PDPlanner",
  "SchoolData",
  "GroweLab",
  "SchoolMint",
  "Avela",
  "PowerSchool",
  "Infinite Campus",
  "EnrollWise",
  "EdBrix",
  "Sibme",
  "SchoolStatus",
  "TeachBoost",
  "IRIS Connect",
  "Edthena",
  "Whetstone",
  "Bullseye",
  "WorkLife",
  "iCarol",
  "KinderSystems",
  "BridgeCare",
  "Wonderschool",
  "TOOTRiS",
];

function rankOf(text: string, needle: string): number | null {
  // Position among numbered-list items, when the mention sits in one.
  const lines = text.split("\n");
  for (const line of lines) {
    const match = /^\s*(\d+)[.)]\s/.exec(line);
    if (match && line.toLowerCase().includes(needle)) {
      return Number(match[1]);
    }
  }
  return null;
}

export async function run(): Promise<void> {
  const db = getDb();
  const runDate = new Date().toISOString().slice(0, 10);
  let inserted = 0;

  for (const model of MODELS) {
    for (const [i, prompt] of AEO_PROMPTS.entries()) {
      let text = "";
      try {
        text = await chat(model, [{ role: "user", content: prompt }], {
          temperature: 0,
        });
      } catch (error) {
        console.warn(
          `AEO prompt ${i + 1} on ${model} failed: ${error instanceof Error ? error.message : error}`,
        );
        continue;
      }
      const mentioned = /solutionwhere|wisdomwhere/i.test(text);
      const cited = /solutionwhere\.com/i.test(text);
      const competitors = COMPETITOR_NAMES.filter((name) =>
        new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text),
      );
      await db
        .insertInto("aeo_results")
        .values({
          run_date: runDate,
          model,
          prompt_id: i + 1,
          prompt,
          mentioned,
          cited,
          position: mentioned ? rankOf(text.toLowerCase(), "solutionwhere") : null,
          competitors_named: competitors,
          raw_response: text,
        })
        .execute();
      inserted += 1;
    }
  }
  console.log(`AEO panel complete: ${inserted} rows for ${runDate}.`);
}
