import type { ProcessedContent } from "../plugins/vfile"
import type { ChangeEvent } from "../plugins/types"
import type { BuildCtx } from "./ctx"
import path from "node:path"
import { FilePath, FullSlug, SimpleSlug, slugifyFilePath } from "./path"
import { isDocumentFamilyMarker, isDocumentFamilyMarkerPath } from "./documentFamily"

export type ChangeLedger = Record<string, ChangeEvent["type"]>

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
    let slug = change.file?.data.slug
    if (change.path.endsWith(".md")) {
      let relativePath: string = change.path
      const directory = path.posix.normalize(ctx.argv.directory)
      if (path.posix.isAbsolute(relativePath)) {
        relativePath = path.posix.relative(directory, relativePath)
      }
      slug = slugifyFilePath(relativePath as FilePath)
    }
    if (!slug) continue
    let folder = path.posix.dirname(slug)
    while (folder !== "." && folder !== "/") {
      if (folder !== "tags") folders.add(folder as SimpleSlug)
      folder = path.posix.dirname(folder)
    }
  }
  return folders
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
