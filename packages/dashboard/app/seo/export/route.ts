import { getDb } from "@app/core";
import { articlePath } from "@app/core/seo/export-mdx";

export const dynamic = "force-dynamic";

// Downloads every generated-but-unpublished draft as one markdown bundle:
// each article with its frontmatter and target path, separated by frontmatter
// blocks. The per-file MDX export for a site-repo PR remains the CLI
// (scripts/export-seo-drafts.ts); this is the review/share path.

export async function GET(): Promise<Response> {
  const db = getDb();
  const articles = await db
    .selectFrom("seo_articles")
    .select(["slug", "title", "meta_description", "markdown", "updated_at"])
    .where("status", "=", "generated")
    .orderBy("slug")
    .execute();

  const esc = (v: string) => v.replace(/"/g, '\\"');
  const parts = articles.map((article) =>
    [
      "---",
      `path: "${articlePath(article.slug)}.mdx"`,
      `title: "${esc(article.title ?? "")}"`,
      `description: "${esc(article.meta_description ?? "")}"`,
      `lastVerified: "${new Date(article.updated_at).toISOString().slice(0, 10)}"`,
      "draft: true",
      "---",
      "",
      article.markdown ?? "",
      "",
    ].join("\n"),
  );

  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="seo-drafts-${new Date().toISOString().slice(0, 10)}.md"`,
    },
  });
}
