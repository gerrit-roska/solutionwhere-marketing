const STRAPI_URL = process.env.STRAPI_API_URL?.replace(/\/$/, "");
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN;

export interface StrapiArticle {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: unknown;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StrapiListResponse {
  data: StrapiArticle[];
}

interface StrapiSingleResponse {
  data: StrapiArticle | null;
}

function assertConfigured(): void {
  if (!STRAPI_URL || !STRAPI_TOKEN) {
    throw new Error("STRAPI_API_URL and STRAPI_API_TOKEN must be set");
  }
}

async function strapiFetch<T>(path: string): Promise<T> {
  assertConfigured();
  const response = await fetch(`${STRAPI_URL}${path}`, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    throw new Error(`Strapi ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getStrapiArticleBySlug(
  slug: string,
): Promise<StrapiArticle | null> {
  const params = new URLSearchParams({
    "filters[slug][$eq]": slug,
    "pagination[pageSize]": "1",
    status: "published",
  });
  const payload = await strapiFetch<StrapiListResponse>(
    `/api/articles?${params}`,
  );
  return payload.data[0] ?? null;
}

export async function listStrapiArticles(limit = 50): Promise<StrapiArticle[]> {
  const params = new URLSearchParams({
    "pagination[pageSize]": String(limit),
    "sort[0]": "publishedAt:desc",
    status: "published",
  });
  const payload = await strapiFetch<StrapiListResponse>(
    `/api/articles?${params}`,
  );
  return payload.data;
}
