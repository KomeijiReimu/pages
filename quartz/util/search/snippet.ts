import { parseSearchQuery, searchEncoder } from "./encoder"
import type { SearchDocument, SearchHit } from "./protocol"

export function searchHit(doc: SearchDocument, raw: string): SearchHit {
  const query = parseSearchQuery(raw).query
  const lower = doc.text.toLowerCase()
  const earliest = (terms: string[]) => {
    let match = -1
    for (const term of terms) {
      if (!term) continue
      const at = lower.indexOf(term.toLowerCase())
      if (at >= 0 && (match < 0 || at < match)) match = at
    }
    return match
  }
  // Prefer the complete phrase, then complete query words. A common first CJK
  // character near the introduction must not steal a later, exact phrase hit.
  let match = earliest([query])
  if (match < 0) match = earliest(query.split(/\s+/u))
  if (match < 0) match = earliest(searchEncoder(query))
  const at = Math.max(match, 0)
  const window = (size: number) => {
    let start = Math.max(0, at - Math.floor(size / 4))
    const paragraph = doc.paragraphs.find((p) => p.start <= at && p.end > at)
    if (paragraph && at - paragraph.start < size / 2) start = paragraph.start
    const end = Math.min(doc.text.length, start + size)
    start = Math.max(0, Math.min(start, end - size))
    return doc.text.slice(start, end).trim()
  }
  const heading = match < 0 ? undefined : [...doc.headings].reverse().find((h) => h.start <= at)
  return {
    slug: doc.slug,
    title: doc.title,
    tags: doc.tags,
    snippet: window(200),
    preview: window(900),
    anchor: heading?.id,
  }
}
