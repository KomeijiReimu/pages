import path from "node:path"
import type { QuartzPluginData, ProcessedContent } from "../plugins/vfile"
import type { BuildCtx } from "./ctx"
import type { FullSlug } from "./path"

export type DocumentFamily = {
  mainSlug: FullSlug
  mainTitle: string
  description: string
}

export function isDocumentFamilyMarkerPath(filePath: string): boolean {
  return path.posix.basename(filePath) === "_family.md"
}

export function isDocumentFamilyMarker(data: QuartzPluginData): boolean {
  const filePath = data.filePath ?? data.relativePath
  return typeof filePath === "string" && isDocumentFamilyMarkerPath(filePath)
}

function normalizeFolderSlug(folderSlug: string): string {
  const normalized = folderSlug.replace(/^\/+|\/+$/g, "")
  return normalized === "index" ? "" : normalized.replace(/\/index$/, "")
}

export function getDocumentFamily(ctx: BuildCtx, folderSlug: string): DocumentFamily | undefined {
  return ctx.documentFamilies?.get(normalizeFolderSlug(folderSlug))
}

// Keep the original body as text, not the transformed HTML tree or description plugin output.
function markerDescription(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF?---[^\S\n]*\n[\s\S]*?\n(?:---|\.\.\.)[^\S\n]*(?:\n|$)/, "")
    .trim()
}

/** Rebuild only from candidates which have already passed every publishing filter. */
export function buildDocumentFamilies(
  content: readonly ProcessedContent[],
): Map<string, DocumentFamily> {
  const families = new Map<string, DocumentFamily>()
  const pages = new Map<string, QuartzPluginData>()
  for (const [, file] of content) {
    const filePath = file.data.filePath ?? file.data.relativePath
    if (typeof filePath === "string" && !isDocumentFamilyMarker(file.data)) {
      pages.set(path.posix.normalize(filePath), file.data)
    }
  }

  for (const [, file] of content) {
    if (!isDocumentFamilyMarker(file.data)) continue
    const warn = (reason: string) => console.warn(`[document-family] Ignoring marker: ${reason}`)
    const main = file.data.frontmatter?.main
    if (typeof main !== "string" || main.trim() === "") {
      warn("main must be a non-empty same-directory Markdown filename")
      continue
    }

    const filename = main.startsWith("./") ? main.slice(2) : main
    // Never normalize a traversal, URL, fragment, or encoded path into a local target.
    if (
      !filename.endsWith(".md") ||
      /[/\\:#?%\u0000-\u001f\u007f]/.test(filename) ||
      ["_family.md", "index.md", "_index.md"].includes(filename)
    ) {
      warn("main must name an ordinary same-directory .md page")
      continue
    }

    const markerPath = (file.data.filePath ?? file.data.relativePath)!
    const target = pages.get(path.posix.join(path.posix.dirname(markerPath), filename))
    if (!target?.slug || !target.frontmatter || target.slug.split("/").at(-1) === "index") {
      warn("main is not an available published ordinary page")
      continue
    }

    const folder = path.posix.dirname(file.data.slug ?? "")
    families.set(folder === "." ? "" : folder, {
      mainSlug: target.slug,
      mainTitle: target.frontmatter.title,
      description: markerDescription(file.value.toString()),
    })
  }

  return families
}
