import type { ProcessedContent } from "../plugins/vfile"
import type { ChangeEvent } from "../plugins/types"
import type { BuildCtx } from "./ctx"
import path from "node:path"
import { FilePath, FullSlug, SimpleSlug, slugifyFilePath } from "./path"
import { isDocumentFamilyMarker, isDocumentFamilyMarkerPath } from "./documentFamily"

export type ChangeLedger = Record<string, ChangeEvent["type"]>

function markdownSlug(ctx: BuildCtx, filePath: FilePath): FullSlug {
  const relativePath = path.posix.isAbsolute(filePath)
    ? path.posix.relative(ctx.argv.directory, filePath)
    : filePath
  return slugifyFilePath(relativePath as FilePath)
}

function addSlug(slugs: Set<FullSlug>, value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    slugs.add(value as FullSlug)
  }
}

export function refreshDerivedContentState(
  ctx: BuildCtx,
  allFiles: readonly FilePath[],
  content: readonly ProcessedContent[],
) {
  const allSlugs = new Set<FullSlug>()
  for (const filePath of allFiles) {
    if (isDocumentFamilyMarkerPath(filePath)) continue
    allSlugs.add(slugifyFilePath(filePath))
  }

  for (const [, file] of content) {
    if (isDocumentFamilyMarker(file.data)) continue
    for (const alias of file.data.aliases ?? []) {
      addSlug(allSlugs, alias)
    }

    addSlug(allSlugs, file.data.permalink)
    addSlug(allSlugs, file.data.frontmatter?.permalink)
  }

  ctx.allFiles = [...allFiles]
  ctx.allSlugs = [...allSlugs]
  ctx.trie = undefined
}

/** Watch paths are content-root-relative, including deletions with no surviving VFile. */
export function affectedFolderSlugs(
  ctx: BuildCtx,
  changes: readonly ChangeEvent[],
): Set<SimpleSlug> {
  const folders = new Set<SimpleSlug>()
  for (const change of changes) {
    const slug = change.path.endsWith(".md")
      ? markdownSlug(ctx, change.path)
      : change.file?.data.slug
    if (!slug) continue
    let folder = path.posix.dirname(slug)
    while (folder !== "." && folder !== "/") {
      if (folder !== "tags") folders.add(folder as SimpleSlug)
      folder = path.posix.dirname(folder)
    }
  }
  return folders
}

/** Only page emitters consume these extra events: discovery lists and breadcrumbs read families. */
export function familyPageChanges(
  ctx: BuildCtx,
  previous: BuildCtx["documentFamilies"],
  content: readonly ProcessedContent[],
  changes: ChangeEvent[],
): ChangeEvent[] {
  const current = ctx.documentFamilies
  const folders = new Set<string>()
  for (const folder of previous?.keys() ?? []) if (!current?.has(folder)) folders.add(folder)
  for (const folder of current?.keys() ?? []) if (!previous?.has(folder)) folders.add(folder)

  // A real index can supply the folder label even when the registry key didn't change.
  for (const { path: fp } of changes) {
    if (!["index.md", "_index.md"].includes(path.posix.basename(fp))) continue
    const folder = path.posix.dirname(markdownSlug(ctx, fp))
    if (current?.has(folder)) folders.add(folder)
  }
  if (folders.size === 0) return changes

  const expanded = [...changes]
  const changedPaths = new Set(changes.map((change) => change.path))
  const prefixes = [...folders].map((folder) => `${folder}/`)
  let hasCategories = false
  for (const [, file] of content) {
    const { slug, relativePath } = file.data
    if (!slug || !relativePath) continue
    if (slug.startsWith("categories/")) hasCategories = true
    if (changedPaths.has(relativePath)) continue
    if (slug === "index" || prefixes.some((prefix) => slug.startsWith(prefix))) {
      expanded.push({ type: "change", path: relativePath, file })
    }
  }
  // FolderPage also generates categories/index when categories only has child pages.
  if (hasCategories && !changedPaths.has("categories/index.md" as FilePath)) {
    expanded.push({ type: "change", path: "categories/index.md" as FilePath })
  }
  return expanded
}

/** Refresh pages that embed a changed source, including through other embeds. */
export function transcludingPageChanges(
  ctx: BuildCtx,
  content: readonly ProcessedContent[],
  changes: ChangeEvent[],
): ChangeEvent[] {
  const targets = new Set(
    changes.filter((e) => e.path.endsWith(".md")).map((e) => markdownSlug(ctx, e.path)),
  )
  if (!targets.size) return changes

  const hosts = new Map<FullSlug, ProcessedContent[1][]>()
  for (const [, file] of content) {
    for (const target of file.data.transcludes ?? []) {
      const list = hosts.get(target)
      if (list) list.push(file)
      else hosts.set(target, [file])
    }
  }
  const expanded = [...changes]
  // Set iteration visits newly added slugs; already visited hosts cut off cycles.
  for (const target of targets) {
    for (const file of hosts.get(target) ?? []) {
      const slug = file.data.slug!
      if (targets.has(slug)) continue
      targets.add(slug)
      expanded.push({ type: "change", path: file.data.relativePath!, file })
    }
  }
  return expanded
}

export function recordChangeBatch(
  changesSinceLastBuild: ChangeLedger,
  batch: readonly ChangeEvent[],
): ChangeLedger {
  for (const change of batch) {
    changesSinceLastBuild[change.path] = change.type
  }

  return { ...changesSinceLastBuild }
}

export function consumeChangeBatch(
  pendingChanges: ChangeEvent[],
  batch: readonly ChangeEvent[],
  changesSinceLastBuild: ChangeLedger,
  consumedLedger: Readonly<ChangeLedger>,
) {
  pendingChanges.splice(0, batch.length)
  for (const [filePath, type] of Object.entries(consumedLedger)) {
    if (changesSinceLastBuild[filePath] === type) {
      delete changesSinceLastBuild[filePath]
    }
  }
}
