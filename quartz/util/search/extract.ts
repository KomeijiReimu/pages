import type { Root, RootContent } from "hast"
import type { SearchDocument, TextRange } from "./protocol"

const blocks = new Set([
  "p",
  "div",
  "section",
  "article",
  "li",
  "ul",
  "ol",
  "table",
  "tr",
  "pre",
  "blockquote",
  "hr",
])
const paragraphs = new Set(["p", "li", "tr", "pre"])

export function extractSearchDocument(
  tree: Root,
  metadata: Pick<SearchDocument, "slug" | "title" | "tags">,
): SearchDocument {
  const parts: string[] = []
  let length = 0
  let last = ""
  const ranges: TextRange[] = []
  const headings: SearchDocument["headings"] = []
  const append = (value: string) => {
    parts.push(value)
    length += value.length
    last = value.at(-1) ?? last
  }
  const newline = () => {
    if (length && last !== "\n") append("\n")
  }
  const visit = (node: Root | RootContent): void => {
    if (node.type === "text") {
      append(node.value)
      return
    }
    if (node.type !== "root" && node.type !== "element") return
    if (node.type === "root") {
      node.children.forEach(visit)
      return
    }
    if (["script", "style", "template"].includes(node.tagName) || node.properties.hidden) return
    const heading = /^h[1-6]$/.test(node.tagName)
    const block = blocks.has(node.tagName) || heading
    if (block) newline()
    const start = length
    if (node.tagName === "br") append("\n")
    node.children.forEach(visit)
    const end = length
    if (end > start && (paragraphs.has(node.tagName) || heading)) ranges.push({ start, end })
    if (heading && typeof node.properties.id === "string")
      headings.push({ id: node.properties.id, start, end })
    if (block) newline()
    else if (node.tagName === "td" || node.tagName === "th") append("\t")
  }
  visit(tree)
  return { ...metadata, text: parts.join(""), paragraphs: ranges, headings }
}
