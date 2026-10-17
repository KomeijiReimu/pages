import FlexSearch from "flexsearch"
import { parseSearchQuery, searchEncoder } from "./encoder"
import {
  assertManifest,
  assertShard,
  fetchAsset,
  type SearchDocument,
  type SearchManifest,
} from "./protocol"
import { searchHit } from "./snippet"

type IndexedDocument = { id: number; title: string; content: string; tags: string[] }

export class SearchEngine {
  private index = new FlexSearch.Document<IndexedDocument>({
    encode: searchEncoder,
    document: {
      id: "id",
      tag: "tags",
      index: [
        { field: "title", tokenize: "forward" },
        { field: "content", tokenize: "forward" },
        { field: "tags", tokenize: "forward" },
      ],
    },
  })

  constructor(private documents: SearchDocument[]) {
    documents.forEach((doc, id) =>
      this.index.add({
        id,
        title: doc.title,
        content: doc.text,
        tags: doc.tags.map((t) => t.toLowerCase()),
      }),
    )
  }

  search(raw: string, limit = 8) {
    const parsed = parseSearchQuery(raw)
    if (!parsed.query) return []
    const max = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 8
    // Query fields independently: FlexSearch's tag + multi-field resolver can
    // intersect title/content, losing body-only matches under an exact tag.
    const fields: ("tags" | "title" | "content")[] = parsed.tagsOnly
      ? ["tags"]
      : ["title", "content"]
    const results = fields.flatMap((field) =>
      this.index.search({
        query: parsed.query,
        limit: max,
        index: [field],
        ...(parsed.tag ? { tag: { tags: parsed.tag } } : {}),
      }),
    )
    const ids = new Set<number>()
    for (const field of ["title", "content", "tags"]) {
      for (const result of results)
        if (result.field === field) for (const id of result.result) ids.add(Number(id))
    }
    return [...ids].slice(0, max).map((id) => searchHit(this.documents[id], raw))
  }
}

export async function loadSearchEngine(
  manifest: SearchManifest,
  manifestUrl: string,
  fetcher: typeof fetch = fetch,
) {
  assertManifest(manifest)
  const documents: SearchDocument[] = []
  const slugs = new Set<string>()
  for (const shard of manifest.shards) {
    const bytes = await fetchAsset(shard, manifestUrl, fetcher)
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    assertShard(data, manifest, shard.documents)
    for (const doc of data.documents) {
      if (slugs.has(doc.slug)) throw new Error("Duplicate search document")
      slugs.add(doc.slug)
      documents.push(doc)
    }
  }
  if (documents.length !== manifest.documents) throw new Error("Incomplete search corpus")
  return new SearchEngine(documents)
}
