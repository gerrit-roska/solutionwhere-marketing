import { notFound } from "next/navigation";
import { getStrapiArticleBySlug } from "@/lib/strapi";
// import { getLegacyBlogPost } from "@/lib/blog-legacy"; // existing MDX/static helper

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;

  let article: Awaited<ReturnType<typeof getStrapiArticleBySlug>> = null;
  try {
    article = await getStrapiArticleBySlug(slug);
  } catch {
    // Strapi not configured yet — fall through to legacy
  }

  if (article) {
    return (
      <article>
        <h1>{article.title}</h1>
        {article.excerpt ? <p>{article.excerpt}</p> : null}
        {/* Render Strapi blocks — use @strapi/blocks-react-renderer or a local mapper */}
        <StrapiBody blocks={article.body} />
      </article>
    );
  }

  // const legacy = await getLegacyBlogPost(slug);
  // if (legacy) return <LegacyBlogPost post={legacy} />;

  notFound();
}

function StrapiBody({ blocks }: { blocks: unknown }) {
  // Replace with blocks renderer wired to your design system
  return <pre>{JSON.stringify(blocks, null, 2)}</pre>;
}
