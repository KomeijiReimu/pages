import type { ChangeEvent } from "../plugins/types"
import type { ProcessedContent, QuartzPluginData } from "../plugins/vfile"
import type { BuildCtx } from "../util/ctx"
import { publishedFolders } from "../util/contentState"
import {
  FullSlug,
  getAllSegmentPrefixes,
  getFileExtension,
  parseLinkAnchor,
  resolveRelative,
  serializeAnchor,
  simplifySlug,
  slugifyFilePath,
  transformLink,
} from "../util/path"

/** Resolve only the OFM nodes collected by CrawlLinks, against this publication snapshot. */
export function resolvePublishedWikilinks(
  ctx: BuildCtx,
  content: ProcessedContent[],
): ChangeEvent[] {
  if (!content.some(([, file]) => file.data.wikilinks)) return []
  const notes = new Map<string, QuartzPluginData>()
  const inputNotes = new Set(
    ctx.allFiles.filter((fp) => fp.endsWith(".md")).map((fp) => slugifyFilePath(fp)),
  )
  const generated = new Set<string>(["tags", "tags/index", "404"])
  for (const folder of publishedFolders(content)) {
    generated.add(folder)
    generated.add(`${folder}/index`)
  }
  for (const [, { data }] of content) {
    notes.set(data.slug!, data)
    for (const alias of data.aliases ?? []) notes.set(alias, data)
    for (const tag of (data.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes)) {
      generated.add(`tags/${tag}`)
    }
  }

  const changed: ChangeEvent[] = []
  let warningCount = 0
  for (const [, file] of content) {
    const wiki = file.data.wikilinks
    if (!wiki) continue
    const source = file.data.slug!
    const outgoing = new Set(wiki.otherLinks)
    const warned = new Set<string>()
    let modified = false
    for (const { node, raw, original, properties, brokenStyle } of wiki.refs) {
      const [fp, anchor] = parseLinkAnchor(raw)
      const href = fp
        ? transformLink(source, raw, { strategy: wiki.strategy, allSlugs: ctx.allSlugs })
        : serializeAnchor(anchor)
      const pathname = new URL(href, `https://base.com/${source}`).pathname.slice(1)
      const target = decodeURIComponent(
        pathname.endsWith("/") || !pathname ? pathname + "index" : pathname,
      ) as FullSlug
      const note = notes.get(target)
      const ext = getFileExtension(fp)
      // Explicit attachment links (including broken resources) remain the link checker's job.
      const available =
        note || generated.has(target) || (ext && ext !== ".md" && !inputNotes.has(target))
      const dest = !available
        ? undefined
        : note && anchor?.kind === "block" && !Object.hasOwn(note.blocks ?? {}, anchor.id)
          ? href.split("#")[0] || resolveRelative(source, source)
          : href
      const linkChanged =
        node.properties.href !== dest || (dest === undefined && node.tagName !== "span")
      modified ||= linkChanged
      if (dest !== href && (!ctx.incremental || linkChanged) && !warned.has(original)) {
        warned.add(original)
        warningCount++
        const action =
          dest === undefined
            ? "target unavailable; rendered as text"
            : `block missing; linked to ${JSON.stringify(dest)} without the fragment`
        console.warn(
          `Warning: [wikilink] ${JSON.stringify(source)} -> ${JSON.stringify(original)}: ${action}`,
        )
      }
      if (dest === undefined) {
        node.tagName = "span"
        node.properties = brokenStyle ? { className: ["internal", "broken"] } : {}
      } else {
        node.tagName = "a"
        node.properties = properties
        node.properties.href = dest
        if (fp) {
          node.properties["data-slug"] = target
          outgoing.add(simplifySlug(target))
        }
      }
    }
    file.data.links = [...outgoing]
    if (modified) changed.push({ type: "change", path: file.data.relativePath!, file })
  }
  if (warningCount && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::${warningCount} wikilink fallback(s); see build warnings for details.`)
  }
  return changed
}
