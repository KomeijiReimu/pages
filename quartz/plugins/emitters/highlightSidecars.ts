import { unlink } from "node:fs/promises"
import path from "node:path"
import type { BuildCtx } from "../../util/ctx"
import type { FullSlug } from "../../util/path"
import type { QuartzEmitterPlugin } from "../types"
import type { ProcessedContent } from "../vfile"
import { write } from "./helpers"

export const HighlightSidecars: QuartzEmitterPlugin = () => {
  const written = new Set<string>()
  const directory = "static/highlight"

  // The input is already publication-filtered. Only scan small hash tables here;
  // never serialize or visit another note's AST to discover transcluded copies.
  async function* sync(ctx: BuildCtx, content: ProcessedContent[]) {
    const live = new Set<string>()
    for (const [, file] of content) {
      const files = file.data.highlightSidecars
      if (!files) continue
      for (const hash of Object.keys(files)) {
        live.add(hash)
        if (written.has(hash)) continue
        const dest = await write({
          ctx,
          slug: `${directory}/${hash}` as FullSlug,
          ext: ".json",
          content: files[hash],
        })
        written.add(hash)
        yield dest
      }
    }
    for (const hash of written) {
      if (live.has(hash)) continue
      await unlink(path.join(ctx.argv.output, directory, hash + ".json"))
      written.delete(hash)
    }
  }

  return {
    name: "HighlightSidecars",
    emit(ctx, content) {
      // A full build (including a full watch rebuild) starts with a clean output directory.
      written.clear()
      return sync(ctx, content)
    },
    partialEmit(ctx, content, _resources, changes) {
      return changes.some((change) => change.path.endsWith(".md")) ? sync(ctx, content) : null
    },
  }
}
