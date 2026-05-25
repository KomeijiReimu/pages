import { QuartzTransformerPlugin } from "../types"
import rehypePrettyCode, { Options as CodeOptions, Theme as CodeTheme } from "rehype-pretty-code"
import { Element, Root } from "hast"
import { visit } from "unist-util-visit"

interface Theme extends Record<string, CodeTheme> {
  light: CodeTheme
  dark: CodeTheme
}

interface Options {
  theme?: Theme
  keepBackground?: boolean
}

const defaultOptions: Options = {
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
  keepBackground: false,
}

function isElement(node: unknown): node is Element {
  return typeof node === "object" && node !== null && "type" in node && node.type === "element"
}

function textContent(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  if ("type" in node && node.type === "text" && "value" in node && typeof node.value === "string") {
    return node.value
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(textContent).join("")
  }
  return ""
}

function countCodeLines(code: Element): number {
  let highlightedLines = 0
  visit(code, "element", (node) => {
    if (node.properties && "dataLine" in node.properties) {
      highlightedLines++
    }
  })

  if (highlightedLines > 0) return highlightedLines

  const rawText = textContent(code).replace(/\n$/, "")
  return Math.max(rawText.split("\n").length, 1)
}

function codeBlockMetrics() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return

      const code = node.children.find((child) => isElement(child) && child.tagName === "code")
      if (!code || !isElement(code)) return

      const lineCount = countCodeLines(code)
      const intrinsicRem = Math.max(lineCount * 1.6 + 1.25, 3.5)

      node.properties ??= {}
      node.properties["data-code-lines"] = String(lineCount)
      node.properties.style = [
        typeof node.properties.style === "string" ? node.properties.style : "",
        `--komei-code-intrinsic-size:${intrinsicRem.toFixed(2)}rem`,
      ]
        .filter(Boolean)
        .join(";")
    })
  }
}

export const SyntaxHighlighting: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts: CodeOptions = { ...defaultOptions, ...userOpts }

  return {
    name: "SyntaxHighlighting",
    htmlPlugins() {
      return [[rehypePrettyCode, opts], codeBlockMetrics]
    },
  }
}
