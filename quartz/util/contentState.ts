import type { ProcessedContent } from "../plugins/vfile"
import type { ChangeEvent } from "../plugins/types"
import type { BuildCtx } from "./ctx"
import { FilePath, FullSlug, slugifyFilePath } from "./path"

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
    allSlugs.add(slugifyFilePath(filePath))
  }

  for (const [, file] of content) {
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
