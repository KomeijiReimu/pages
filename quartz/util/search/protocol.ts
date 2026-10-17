export const searchSchemaVersion = 1 as const
export const searchManifestPath = "/static/search/manifest.json"

export type TextRange = { start: number; end: number }
export type SearchDocument = {
  slug: string
  title: string
  tags: string[]
  text: string
  paragraphs: TextRange[]
  headings: (TextRange & { id: string })[]
}
export type SearchHit = {
  slug: string
  title: string
  tags: string[]
  snippet: string
  preview: string
  anchor?: string
}
export type SearchAsset = { url: string; sha256: string }
export type SearchManifest = {
  schemaVersion: typeof searchSchemaVersion
  contentVersion: string
  documents: number
  worker: SearchAsset
  shards: (SearchAsset & { documents: number })[]
}
export type SearchShard = {
  schemaVersion: typeof searchSchemaVersion
  contentVersion: string
  documents: SearchDocument[]
}
export type SearchRequest =
  | { type: "init"; id: number; manifest: SearchManifest; manifestUrl: string }
  | { type: "search"; id: number; query: string; limit?: number }
export type SearchResponse =
  | { type: "ready"; id: number }
  | { type: "result"; id: number; hits: SearchHit[] }
  | { type: "error"; id: number; message: string }

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object"
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string")
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)

export function assertManifest(v: unknown): asserts v is SearchManifest {
  if (
    !record(v) ||
    v.schemaVersion !== searchSchemaVersion ||
    !hash(v.contentVersion) ||
    !count(v.documents) ||
    !record(v.worker) ||
    !hash(v.worker.sha256) ||
    v.worker.url !== `worker.${v.worker.sha256}.js` ||
    !Array.isArray(v.shards)
  )
    throw new Error("Invalid search manifest version or schema")
  const urls = new Set<string>()
  let documents = 0
  for (const shard of v.shards) {
    if (
      !record(shard) ||
      !hash(shard.sha256) ||
      shard.url !== `text.${shard.sha256}.json` ||
      !count(shard.documents) ||
      shard.documents === 0 ||
      urls.has(shard.url)
    )
      throw new Error("Invalid search shard descriptor")
    urls.add(shard.url)
    documents += shard.documents
  }
  if (documents !== v.documents) throw new Error("Incomplete search manifest")
}

export function assertShard(
  v: unknown,
  manifest: SearchManifest,
  expected: number,
): asserts v is SearchShard {
  if (
    !record(v) ||
    v.schemaVersion !== searchSchemaVersion ||
    v.contentVersion !== manifest.contentVersion ||
    !Array.isArray(v.documents) ||
    v.documents.length !== expected
  )
    throw new Error("Search shard version or count mismatch")
  for (const doc of v.documents) {
    if (
      !record(doc) ||
      typeof doc.slug !== "string" ||
      typeof doc.title !== "string" ||
      !strings(doc.tags) ||
      typeof doc.text !== "string" ||
      !Array.isArray(doc.paragraphs) ||
      !Array.isArray(doc.headings)
    )
      throw new Error("Invalid search document")
    const length = doc.text.length
    const range = (r: unknown) =>
      record(r) && count(r.start) && count(r.end) && r.start <= r.end && r.end <= length
    if (
      !doc.paragraphs.every(range) ||
      !doc.headings.every((h) => range(h) && typeof h.id === "string")
    )
      throw new Error("Invalid search text offsets")
  }
}

export function isSearchHit(v: unknown): v is SearchHit {
  return (
    record(v) &&
    typeof v.slug === "string" &&
    typeof v.title === "string" &&
    strings(v.tags) &&
    typeof v.snippet === "string" &&
    typeof v.preview === "string" &&
    (v.anchor === undefined || typeof v.anchor === "string")
  )
}

export function assetUrl(asset: SearchAsset, manifestUrl: string): URL {
  const base = new URL(manifestUrl)
  const url = new URL(asset.url, base)
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1))
  )
    throw new Error("Unsafe search asset URL")
  return url
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("")
}

export async function fetchAsset(
  asset: SearchAsset,
  manifestUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const response = await fetcher(assetUrl(asset, manifestUrl))
  if (!response.ok) throw new Error(`Search asset request failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if ((await sha256(bytes)) !== asset.sha256) throw new Error("Search asset hash mismatch")
  return bytes
}
