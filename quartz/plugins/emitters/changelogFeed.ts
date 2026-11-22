import type { RootContent } from "hast"
import type { BuildCtx } from "../../util/ctx"
import { escapeHTML } from "../../util/escape"
import { type FullSlug, slugifyFilePath } from "../../util/path"
import type { QuartzEmitterPlugin } from "../types"
import type { ProcessedContent } from "../vfile"
import { write } from "./helpers"

const changelog = "changelog/index"

// Feed readers have no page-relative link context. Keep link labels and code text,
// not markup, transcluded notes, or Quartz's serialized syntax-highlighting data.
function readerText(node: RootContent): string {
  if (node.type === "text") return node.value
  if (node.type !== "element") return ""
  const { tagName, properties, children } = node
  if (
    ["script", "style", "template", "svg", "iframe", "button"].includes(tagName) ||
    properties.role === "anchor" ||
    properties.ariaHidden === true ||
    properties.ariaHidden === "true" ||
    (Array.isArray(properties.className) && properties.className.includes("transclude"))
  )
    return ""
  if (tagName === "br") return "\n"
  const text = children.map(readerText).join("")
  if (tagName === "li") return `\n• ${text.trim()}\n`
  if (["p", "pre", "blockquote", "div", "h4", "h5", "h6"].includes(tagName)) return `\n${text}\n`
  return text
}

type Day = { key: string; date: Date; anchor: string; body: string[] }

async function emitFeed(ctx: BuildCtx, content: ProcessedContent[]) {
  const { baseUrl, pageTitle } = ctx.cfg.configuration
  if (!baseUrl) throw new Error("ChangelogFeed requires configuration.baseUrl")
  const page = new URL("changelog/", `https://${baseUrl.replace(/\/$/, "")}/`).href
  const tree = content.find(([, file]) => file.data.slug === changelog)?.[0]
  const days = new Map<string, Day>()
  let year: string | undefined
  let day: Day | undefined
  for (const node of tree?.children ?? []) {
    if (node.type === "element" && (node.tagName === "h1" || node.tagName === "h2")) {
      year = node.tagName === "h2" ? /^\d{4}$/.exec(readerText(node).trim())?.[0] : undefined
      day = undefined
    } else if (node.type === "element" && node.tagName === "h3") {
      day = undefined
      const match = /^(\d{1,2})\s*月\s*(\d{1,2})\s*日$/.exec(readerText(node).trim())
      const anchor = node.properties.id
      if (!year || !match || typeof anchor !== "string" || !anchor) continue
      const key = `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
      const date = new Date(`${key}T00:00:00Z`)
      if (isNaN(date.valueOf()) || !date.toISOString().startsWith(key)) continue
      day = days.get(key) ?? { key, date, anchor, body: [] }
      days.set(key, day)
    } else if (day) {
      const text = readerText(node).trim()
      if (text) day.body.push(text)
    }
  }

  const items = [...days.values()]
    .sort((a, b) => b.date.valueOf() - a.date.valueOf())
    .map(({ key, date, anchor, body }) => {
      // RSS descriptions contain HTML inside XML: escape the author's text at both boundaries.
      const description = escapeHTML(body.join("\n")).replace(/\n+/g, "<br>")
      return `<item>
  <title>${key} 更新日志</title>
  <link>${escapeHTML(page + "#" + encodeURIComponent(anchor))}</link>
  <guid isPermaLink="false">changelog:${key}</guid>
  <pubDate>${date.toUTCString()}</pubDate>
  <description>${escapeHTML(description)}</description>
</item>`
    })
    .join("\n")

  return [
    await write({
      ctx,
      slug: "changelog/feed" as FullSlug,
      ext: ".xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${escapeHTML(pageTitle)} · 更新日志</title>
<link>${escapeHTML(page)}</link>
<description>按日期发布的更新日志</description>
${items}
</channel></rss>\n`,
    }),
  ]
}

export const ChangelogFeed: QuartzEmitterPlugin = () => ({
  name: "ChangelogFeed",
  emit: emitFeed,
  partialEmit(ctx, content, _resources, changes) {
    return changes.some(({ path }) => path.endsWith(".md") && slugifyFilePath(path) === changelog)
      ? emitFeed(ctx, content)
      : null
  },
})
