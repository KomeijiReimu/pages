import { createHash } from "node:crypto"
import { build } from "esbuild"
import {
  searchSchemaVersion,
  type SearchDocument,
  type SearchManifest,
  type SearchShard,
} from "./protocol"

const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")

export async function buildSearchAssets(documents: SearchDocument[], shardTargetBytes = 512_000) {
  const sorted = [...documents].sort((a, b) => a.slug.localeCompare(b.slug))
  const contentVersion = digest(JSON.stringify(sorted))
  const output = await build({
    entryPoints: ["quartz/components/scripts/search.worker.ts"],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
  })
  const worker = output.outputFiles[0].contents
  const workerHash = digest(worker)
  const files = new Map<string, string | Uint8Array>([[`worker.${workerHash}.js`, worker]])
  const manifest: SearchManifest = {
    schemaVersion: searchSchemaVersion,
    contentVersion,
    documents: sorted.length,
    worker: { url: `worker.${workerHash}.js`, sha256: workerHash },
    shards: [],
  }
  let group: SearchDocument[] = []
  let bytes = 0
  const flush = () => {
    if (!group.length) return
    const shard: SearchShard = {
      schemaVersion: searchSchemaVersion,
      contentVersion,
      documents: group,
    }
    const json = JSON.stringify(shard)
    const hash = digest(json)
    const url = `text.${hash}.json`
    files.set(url, json)
    manifest.shards.push({ url, sha256: hash, documents: group.length })
    group = []
    bytes = 0
  }
  for (const doc of sorted) {
    const size = Buffer.byteLength(JSON.stringify(doc))
    if (bytes && bytes + size > shardTargetBytes) flush()
    group.push(doc)
    bytes += size
  }
  flush()
  // Mutable entry point is written after all immutable, hashed resources.
  files.set("manifest.json", JSON.stringify(manifest))
  return { manifest, files }
}
