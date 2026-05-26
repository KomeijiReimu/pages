import { QuartzTransformerPlugin } from "../types"
import rehypePrettyCode, { Options as CodeOptions, Theme as CodeTheme } from "rehype-pretty-code"
import { Element, Root } from "hast"
import { toHtml } from "hast-util-to-html"
import { visit } from "unist-util-visit"

// @ts-ignore
import codeblockScript from "../../components/scripts/codeblock.inline"

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

function hasDataLine(node: Element): boolean {
  return Boolean(
    node.properties && ("dataLine" in node.properties || "data-line" in node.properties),
  )
}

function countCodeLines(code: Element): number {
  let highlightedLines = 0
  visit(code, "element", (node) => {
    if (hasDataLine(node)) {
      highlightedLines++
    }
  })

  if (highlightedLines > 0) return highlightedLines

  const rawText = textContent(code).replace(/\n$/, "")
  return Math.max(rawText.split("\n").length, 1)
}

function collectHighlightedLines(code: Element): Element[] {
  const lines: Element[] = []
  visit(code, "element", (node) => {
    if (hasDataLine(node)) {
      lines.push(node)
    }
  })
  return lines
}

function codeSource(code: Element): string {
  const highlightedLines = collectHighlightedLines(code)
  if (highlightedLines.length > 0) {
    return highlightedLines.map(textContent).join("\n")
  }

  return textContent(code).replace(/\n$/, "")
}

function isMermaidCode(code: Element): boolean {
  const className = code.properties?.className
  const language = code.properties?.dataLanguage ?? code.properties?.["data-language"]
  return (
    (Array.isArray(className) && className.includes("mermaid")) ||
    language === "mermaid" ||
    language === "mmd"
  )
}

function makeLightweightCode(code: Element, source: string): Element {
  const properties = { ...(code.properties ?? {}) }
  properties["dataKomeiCodePlaceholder"] = "true"
  properties["dataClipboard"] = JSON.stringify(source)

  return {
    type: "element",
    tagName: "code",
    properties,
    children: [{ type: "text", value: source }],
  }
}

function makeHighlightChunkScript(chunks: string[][]): Element {
  return {
    type: "element",
    tagName: "script",
    properties: {
      type: "application/json",
      dataKomeiCodeChunks: "true",
    },
    children: [{ type: "text", value: JSON.stringify(chunks) }],
  }
}

function codeBlockMetrics() {
  const chunkLineCount = 12

  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return

      const code = node.children.find((child) => isElement(child) && child.tagName === "code")
      if (!code || !isElement(code)) return

      const lineCount = countCodeLines(code)
      const intrinsicRem = Math.max(lineCount * 1.6 + 1.25, 3.5)
      const mermaid = isMermaidCode(code)
      const source = codeSource(code)

      node.properties ??= {}
      node.properties["data-code-lines"] = String(lineCount)
      node.properties.style = [
        typeof node.properties.style === "string" ? node.properties.style : "",
        `--komei-code-intrinsic-size:${intrinsicRem.toFixed(2)}rem`,
      ]
        .filter(Boolean)
        .join(";")

      if (!mermaid) {
        const highlightedLines = collectHighlightedLines(code)
        const chunks: string[][] = []
        for (let start = 0; start < highlightedLines.length; start += chunkLineCount) {
          chunks.push(
            highlightedLines.slice(start, start + chunkLineCount).map((line) => toHtml(line)),
          )
        }

        node.properties["dataKomeiCodeLazy"] = "true"
        node.properties["dataKomeiCodeHydrated"] = "false"
        node.properties["dataKomeiCodeChunkSize"] = String(chunkLineCount)
        node.properties["dataKomeiCodeChunkCount"] = String(chunks.length)
        if (node.properties.tabIndex !== undefined || node.properties.tabindex !== undefined) {
          node.properties["dataKomeiOriginalTabindex"] = String(
            node.properties.tabIndex ?? node.properties.tabindex,
          )
          node.properties.tabIndex = -1
          delete node.properties.tabindex
        }
        const codeIndex = node.children.indexOf(code)
        if (codeIndex !== -1) {
          node.children.splice(
            codeIndex,
            1,
            makeLightweightCode(code, source),
            makeHighlightChunkScript(chunks),
          )
        }
      }
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
    externalResources() {
      return {
        js: [
          {
            loadTime: "afterDOMReady",
            contentType: "inline",
            script: codeblockScript,
          },
        ],
      }
    },
  }
}
