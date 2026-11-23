import { createHash } from "node:crypto"

// Keep ordinary pages self-contained. Oversized pages move their largest blocks out first.
export const inlineHighlightBudget = 128 * 1024
export const highlightGroupBudget = 64 * 1024

export function groupHighlightChunks(chunks: string[], files: Record<string, string>) {
  let largest = 0
  for (const chunk of chunks) largest = Math.max(largest, Buffer.byteLength(chunk))
  const groupSize = Math.max(1, Math.min(8, Math.floor((highlightGroupBudget - 1) / (largest + 1))))
  const hashes: string[] = []
  for (let i = 0; i < chunks.length; i += groupSize) {
    const body = `[${chunks.slice(i, i + groupSize).join(",")}]`
    // An indivisible 12-line chunk (e.g. minified JS) can itself exceed the cap.
    // Leave those particular lines in their original, selectable plain-text form.
    if (Buffer.byteLength(body) > highlightGroupBudget) {
      hashes.push("-")
      continue
    }
    const hash = createHash("sha256").update(body).digest("hex")
    files[hash] = body
    hashes.push(hash)
  }
  return { hashes, groupSize }
}

declare module "vfile" {
  interface DataMap {
    highlightSidecars: Record<string, string>
  }
}
