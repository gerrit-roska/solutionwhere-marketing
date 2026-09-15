import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDb } from "../db/index";
import { projectRoot } from "../config";

// MDX export — the publishing path while cms.type is "none"
// (05-seo-aeo-execution.md §1: the site is custom Next.js with no CMS, so
// drafts leave this system as files a human ships as a PR to the site repo).
//
// Stub by design: it renders one article (or every unpublished draft) to
// MDX with frontmatter under exports/seo/. What it deliberately does NOT do
// yet: open the PR itself. That decision (which repo, which branch
// convention, who reviews) is a Sept-16 agenda item with the client.

// 05 §3–§5 path prefixes, keyed by slug shape. The queue stores flat slugs;
// the site nests them.
const PATH_RULES: [RegExp, string][] = [
  [/^solutionwhere-vs-/, "compare"],
  [/-vs-(vector-solutions|kalpa|kickup|teachboost|powerschool-enrollment|avela|infinite-campus-registration|icarol)$/, "compare"],
  [/-alternative$/, "alternatives"],
  [/-review$/, "reviews"],
  [/^best-/, "best"],
  [/^for-/, "for"],
  [/^(security|ferpa|accessibility|pricing|procurement|implementation|trust)$/, ""],
  [/^(steps-to-|.*teacher.*|.*certification.*|.*license.*|.*renewal.*)/, "blog"],
];

export function articlePath(slug: string): string {
  for (const [pattern, prefix] of PATH_RULES) {
    if (pattern.test(slug)) return prefix ? `${prefix}/${slug}` : slug;
  }
  // Category/solution slugs and everything else publish at the root level
  // under /solutions/ when they are category pages; spokes default to blog.
  return `solutions/${slug}`;
}

function frontmatter(article: {
  title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  updated_at: Date;
}): string {
  const esc = (v: string) => v.replace(/"/g, '\\"');
  return [
    "---",
    `title: "${esc(article.title ?? "")}"`,
    `description: "${esc(article.meta_description ?? "")}"`,
    `excerpt: "${esc(article.excerpt ?? "")}"`,
    `lastVerified: "${article.updated_at.toISOString().slice(0, 10)}"`,
    "draft: true",
    "---",
    "",
  ].join("\n");
}

/** Renders one article to MDX and writes it under exports/seo/. */
export async function exportArticleMdx(slug: string): Promise<string> {
  const db = getDb();
  const article = await db
    .selectFrom("seo_articles")
    .selectAll()
    .where("slug", "=", slug)
    .executeTakeFirst();
  if (!article) throw new Error(`No article with slug "${slug}".`);
  if (!article.markdown) throw new Error(`Article "${slug}" has no markdown.`);

  const rel = `${articlePath(slug)}.mdx`;
  const out = join(projectRoot(), "exports/seo", rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, frontmatter(article) + article.markdown, "utf-8");
  return out;
}

/** Exports every generated-but-unpublished article. Returns paths written. */
export async function exportAllDrafts(): Promise<string[]> {
  const db = getDb();
  const articles = await db
    .selectFrom("seo_articles")
    .select("slug")
    .where("status", "=", "generated")
    .execute();
  const written: string[] = [];
  for (const { slug } of articles) {
    written.push(await exportArticleMdx(slug));
  }
  return written;
}
