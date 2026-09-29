export interface BookMetadata {
  title: string;
  authors: string[];
  description?: string;
  firstPublished?: number;
  coverUrl?: string;
  sourceUrl?: string;
  subjects: string[];
  source: "Open Library";
}

interface SearchResult {
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  cover_i?: unknown;
  subject?: unknown;
  first_sentence?: unknown;
  description?: unknown;
  key?: unknown;
}

const metadataCache = new Map<string, { expiresAt: number; value: BookMetadata | null }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (isRecord(value) && typeof value.value === "string") return value.value;
  return undefined;
}

export function parseOpenLibraryMetadata(value: unknown): BookMetadata | null {
  if (!isRecord(value) || !Array.isArray(value.docs)) throw new Error("Open Library returned an invalid search response.");
  const result = value.docs.find((row): row is SearchResult => isRecord(row) && typeof row.title === "string");
  if (!result || typeof result.title !== "string") return null;
  const authors = Array.isArray(result.author_name)
    ? result.author_name.filter((author): author is string => typeof author === "string").slice(0, 5)
    : [];
  const subjects = Array.isArray(result.subject)
    ? result.subject.filter((subject): subject is string => typeof subject === "string").slice(0, 6)
    : [];
  const firstPublished = typeof result.first_publish_year === "number" ? result.first_publish_year : undefined;
  const coverId = typeof result.cover_i === "number" ? result.cover_i : undefined;
  const description = textValue(result.description) || textValue(result.first_sentence);
  const sourceUrl = typeof result.key === "string" && result.key.startsWith("/works/")
    ? `https://openlibrary.org${result.key}`
    : `https://openlibrary.org/search?q=${encodeURIComponent(result.title)}`;
  return {
    title: result.title,
    authors,
    ...(description ? { description } : {}),
    ...(firstPublished ? { firstPublished } : {}),
    ...(coverId ? { coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    subjects,
    source: "Open Library",
  };
}

async function getWorkDescription(metadata: BookMetadata) {
  if (!metadata.sourceUrl) return undefined;
  try {
    const workUrl = new URL(metadata.sourceUrl);
    if (workUrl.hostname !== "openlibrary.org" || !/^\/works\/OL\d+W$/.test(workUrl.pathname)) return undefined;
    const response = await fetch(`${workUrl.toString()}.json`, {
      headers: { "User-Agent": "BookFreek/0.1 (https://github.com/ChrisFinwall/BookFreek)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.warn(`Open Library work description lookup failed (${response.status}).`);
      return undefined;
    }
    const work = await response.json() as unknown;
    return isRecord(work) ? textValue(work.description) : undefined;
  } catch (error) {
    console.warn("Open Library work description lookup failed:", error);
    return undefined;
  }
}

export async function lookupOpenLibraryMetadata(title: string, author?: string): Promise<BookMetadata | null> {
  const cacheKey = `${title.trim().toLowerCase()}\n${author?.trim().toLowerCase() ?? ""}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) metadataCache.delete(cacheKey);

  const params = new URLSearchParams({
    title: title.slice(0, 200),
    limit: "5",
    fields: "title,author_name,first_publish_year,cover_i,subject,first_sentence,key",
  });
  if (author) params.set("author", author.slice(0, 120));
  const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers: { "User-Agent": "BookFreek/0.1 (https://github.com/ChrisFinwall/BookFreek)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Open Library lookup failed (${response.status}).`);
  const metadata = parseOpenLibraryMetadata(await response.json() as unknown);
  if (metadata) metadata.description = await getWorkDescription(metadata) || metadata.description;
  if (metadataCache.size >= 500) metadataCache.delete(metadataCache.keys().next().value!);
  metadataCache.set(cacheKey, { value: metadata, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return metadata;
}
