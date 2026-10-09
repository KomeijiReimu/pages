import { BuildCtx } from "../util/ctx"
import { PerfTimer } from "../util/perf"
import { ProcessedContent } from "../plugins/vfile"
import { buildDocumentFamilies, isDocumentFamilyMarker } from "../util/documentFamily"

export function filterContent(ctx: BuildCtx, content: ProcessedContent[]): ProcessedContent[] {
  const { cfg, argv } = ctx
  const perf = new PerfTimer()
  const initialLength = content.length
  for (const plugin of cfg.plugins.filters) {
    const updatedContent = content.filter((item) => plugin.shouldPublish(ctx, item))

    if (argv.verbose) {
      const diff = content.filter((x) => !updatedContent.includes(x))
      for (const file of diff) {
        console.log(`[filter:${plugin.name}] ${file[1].data.slug}`)
      }
    }

    content = updatedContent
  }

  ctx.documentFamilies = buildDocumentFamilies(content)
  content = content.filter(([, file]) => !isDocumentFamilyMarker(file.data))
  // Cached tries must only be rebuilt from this final ordinary published content.
  ctx.trie = undefined

  console.log(`Filtered out ${initialLength - content.length} files in ${perf.timeSince()}`)
  return content
}
