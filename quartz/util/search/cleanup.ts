import { readFile, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { assertManifest, type SearchManifest } from "./protocol"

export async function readSearchManifest(directory: string): Promise<SearchManifest | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"))
    assertManifest(value)
    return value
  } catch {
    // An absent, unreadable or invalid old manifest cannot authorize deletion.
    return undefined
  }
}

export async function pruneSearchAssets(
  directory: string,
  previous: SearchManifest | undefined,
  current: SearchManifest,
) {
  if (!previous) return
  // Validation permits only bare worker.<sha256>.js / text.<sha256>.json names.
  // No directory scan, recursive removal, or deletion of unreferenced files.
  assertManifest(previous)
  assertManifest(current)
  const names = (manifest: SearchManifest) => [
    manifest.worker.url,
    ...manifest.shards.map((shard) => shard.url),
  ]
  const keep = new Set(names(current))
  for (const name of names(previous)) {
    if (keep.has(name)) continue
    try {
      await unlink(resolve(directory, name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
}
