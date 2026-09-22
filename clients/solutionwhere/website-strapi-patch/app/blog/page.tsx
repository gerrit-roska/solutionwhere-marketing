import { listStrapiArticles } from "@/lib/strapi";
// import { listLegacyBlogPosts } from "@/lib/blog-legacy";

export default async function BlogIndexPage() {
  let strapiPosts: Awaited<ReturnType<typeof listStrapiArticles>> = [];
  try {
    strapiPosts = await listStrapiArticles();
  } catch {
    // Strapi not configured — legacy-only list
  }

  // const legacyPosts = await listLegacyBlogPosts();
  // const merged = mergeBlogLists(strapiPosts, legacyPosts);

  const merged = strapiPosts.map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    source: "strapi" as const,
  }));

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {merged.map((post) => (
          <li key={post.slug}>
            <a href={`/blog/${post.slug}`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
