import { PerfTimer } from "../util/perf"
import { getStaticResourcesFromPlugins } from "../plugins"
import { ProcessedContent } from "../plugins/vfile"
import { QuartzLogger } from "../util/log"
import { trace } from "../util/trace"
import { BuildCtx } from "../util/ctx"
import { styleText } from "util"
import { finalizeNativeRoutes, htmlPageEmitters } from "./nativeRouteHints"
import { resolvePublishedWikilinks } from "./wikilinks"

export async function emitContent(ctx: BuildCtx, content: ProcessedContent[]) {
  const { argv, cfg } = ctx
  const perf = new PerfTimer()
  const log = new QuartzLogger(ctx.argv.verbose)

  log.start(`Emitting files`)
  resolvePublishedWikilinks(ctx, content)

  let emittedFiles = 0
  const htmlFiles = new Set<string>()
  const staticResources = getStaticResourcesFromPlugins(ctx)
  await Promise.all(
    cfg.plugins.emitters.map(async (emitter) => {
      try {
        const emitted = await emitter.emit(ctx, content, staticResources)
        for await (const file of emitted) {
          emittedFiles++
          if (htmlPageEmitters.has(emitter.name) && file.endsWith(".html")) htmlFiles.add(file)
          if (ctx.argv.verbose) console.log(`[emit:${emitter.name}] ${file}`)
          else log.updateText(`${emitter.name} -> ${styleText("gray", file)}`)
        }
      } catch (err) {
        trace(`Failed to emit from plugin \`${emitter.name}\``, err as Error)
      }
    }),
  )

  await finalizeNativeRoutes(ctx, content, htmlFiles, true)

  log.end(`Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince()}`)
}
