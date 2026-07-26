import sourceMapSupport from "source-map-support"
sourceMapSupport.install(options)
import path from "path"
import { PerfTimer } from "./util/perf"
import { rm } from "fs/promises"
import { styleText } from "util"
import { parseMarkdown } from "./processors/parse"
import { filterContent } from "./processors/filter"
import { emitContent } from "./processors/emit"
import cfg from "../quartz.config"
import { FilePath, joinSegments } from "./util/path"
import chokidar from "chokidar"
import { ProcessedContent } from "./plugins/vfile"
import { Argv, BuildCtx } from "./util/ctx"
import { glob, toPosixPath } from "./util/glob"
import { trace } from "./util/trace"
import { options } from "./util/sourcemap"
import { Mutex } from "async-mutex"
import { getStaticResourcesFromPlugins } from "./plugins"
import { randomIdNonSecure } from "./util/random"
import { ChangeEvent } from "./plugins/types"
import { ContentIgnoreMatcher, createContentIgnoreMatcher } from "./util/contentIgnore"
import {
  ChangeLedger,
  consumeChangeBatch,
  recordChangeBatch,
  refreshDerivedContentState,
} from "./util/contentState"
import { withMutex } from "./util/mutex"

type ContentMap = Map<
  FilePath,
  | {
      type: "markdown"
      content: ProcessedContent
    }
  | {
      type: "other"
    }
>

type BuildData = {
  ctx: BuildCtx
  ignored: ContentIgnoreMatcher
  mut: Mutex
  contentMap: ContentMap
  changesSinceLastBuild: ChangeLedger
  lastBuildMs: number
}

async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  const ctx: BuildCtx = {
    buildId: randomIdNonSecure(),
    argv,
    cfg,
    allSlugs: [],
    allFiles: [],
    incremental: false,
  }

  const perf = new PerfTimer()
  const output = argv.output

  const pluginCount = Object.values(cfg.plugins).flat().length
  const pluginNames = (key: "transformers" | "filters" | "emitters") =>
    cfg.plugins[key].map((plugin) => plugin.name)
  if (argv.verbose) {
    console.log(`Loaded ${pluginCount} plugins`)
    console.log(`  Transformers: ${pluginNames("transformers").join(", ")}`)
    console.log(`  Filters: ${pluginNames("filters").join(", ")}`)
    console.log(`  Emitters: ${pluginNames("emitters").join(", ")}`)
  }

  const release = await mut.acquire()
  perf.addEvent("clean")
  await rm(output, { recursive: true, force: true })
  console.log(`Cleaned output directory \`${output}\` in ${perf.timeSince("clean")}`)

  perf.addEvent("glob")
  const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns, {
    includeGitignored: argv.includeGitignored,
  })
  const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
  console.log(
    `Found ${markdownPaths.length} input files from \`${argv.directory}\` in ${perf.timeSince("glob")}`,
  )

  const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
  refreshDerivedContentState(ctx, allFiles, [])

  const parsedFiles = await parseMarkdown(ctx, filePaths)
  refreshDerivedContentState(ctx, allFiles, parsedFiles)
  const filteredContent = filterContent(ctx, parsedFiles)

  await emitContent(ctx, filteredContent)
  console.log(
    styleText("green", `Done processing ${markdownPaths.length} files in ${perf.timeSince()}`),
  )
  release()

  if (argv.watch) {
    ctx.incremental = true
    return startWatching(ctx, mut, parsedFiles, clientRefresh)
  }
}

// setup watcher for rebuilds
async function startWatching(
  ctx: BuildCtx,
  mut: Mutex,
  initialContent: ProcessedContent[],
  clientRefresh: () => void,
) {
  const { argv, allFiles } = ctx

  const contentMap: ContentMap = new Map()
  for (const filePath of allFiles) {
    contentMap.set(filePath, {
      type: "other",
    })
  }

  for (const content of initialContent) {
    const [_tree, vfile] = content
    contentMap.set(vfile.data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  const ignored = await createContentIgnoreMatcher({
    contentRoot: argv.directory,
    ignorePatterns: cfg.configuration.ignorePatterns,
    includeGitignored: argv.includeGitignored,
  })
  const buildData: BuildData = {
    ctx,
    mut,
    contentMap,
    ignored,

    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }

  const watcher = chokidar.watch(".", {
    awaitWriteFinish: { stabilityThreshold: 250 },
    persistent: true,
    cwd: argv.directory,
    ignoreInitial: true,
  })

  const changes: ChangeEvent[] = []
  const rebuildFromChanges = () => {
    void rebuild(changes, clientRefresh, buildData).catch((err) => {
      console.error(styleText("red", "Rebuild failed; waiting for the next content change."), err)
    })
  }
  watcher
    .on("add", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "add" })
      rebuildFromChanges()
    })
    .on("change", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "change" })
      rebuildFromChanges()
    })
    .on("unlink", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "delete" })
      rebuildFromChanges()
    })

  return async () => {
    await watcher.close()
  }
}

async function fullContentRebuild(buildData: BuildData): Promise<number> {
  const { ctx, contentMap } = buildData
  const { argv, cfg } = ctx

  await rm(argv.output, { recursive: true, force: true })

  const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns, {
    includeGitignored: argv.includeGitignored,
  })
  const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
  const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)

  // FrontMatter extends this physical slug set while parsing aliases.
  refreshDerivedContentState(ctx, allFiles, [])

  const parsedFiles = await parseMarkdown(ctx, filePaths)
  contentMap.clear()
  for (const filePath of allFiles) {
    contentMap.set(filePath, { type: "other" })
  }
  for (const content of parsedFiles) {
    contentMap.set(content[1].data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  refreshDerivedContentState(ctx, allFiles, parsedFiles)
  const filteredContent = filterContent(ctx, parsedFiles)
  await emitContent(ctx, filteredContent)

  return markdownPaths.length
}

async function rebuild(changes: ChangeEvent[], clientRefresh: () => void, buildData: BuildData) {
  const { ctx, contentMap, mut, changesSinceLastBuild } = buildData
  const { argv, cfg } = ctx

  const buildId = randomIdNonSecure()
  ctx.buildId = buildId
  buildData.lastBuildMs = new Date().getTime()

  await withMutex(mut, async () => {
    // if there's another build after us, let the newest invocation consume the queue
    if (ctx.buildId !== buildId) return

    // Events can continue appending while this build runs. Only consume this snapshot.
    const batch = changes.slice()
    if (batch.length === 0) return
    const changeLedger = recordChangeBatch(changesSinceLastBuild, batch)

    const perf = new PerfTimer()
    perf.addEvent("rebuild")
    console.log(styleText("yellow", "Detected change, rebuilding..."))

    const requiresFullContentRebuild =
      argv.includeGitignored &&
      Object.values(changeLedger).some((type) => type === "add" || type === "delete")

    if (requiresFullContentRebuild) {
      const markdownCount = await fullContentRebuild(buildData)
      consumeChangeBatch(changes, batch, changesSinceLastBuild, changeLedger)
      console.log(
        styleText(
          "green",
          `Done rebuilding all content (${markdownCount} Markdown files) in ${perf.timeSince()}`,
        ),
      )
      clientRefresh()
      return
    }

    const staticResources = getStaticResourcesFromPlugins(ctx)
    const pathsToParse: FilePath[] = []
    for (const [fp, type] of Object.entries(changeLedger)) {
      if (type === "delete" || path.extname(fp) !== ".md") continue
      const fullPath = joinSegments(argv.directory, toPosixPath(fp)) as FilePath
      pathsToParse.push(fullPath)
    }

    const parsed = await parseMarkdown(ctx, pathsToParse)
    for (const content of parsed) {
      contentMap.set(content[1].data.relativePath!, {
        type: "markdown",
        content,
      })
    }

    // update state using the current change snapshot
    // we do this weird play of add => compute change events => remove
    // so that partialEmitters can do appropriate cleanup based on the content of deleted files
    for (const [file, change] of Object.entries(changeLedger)) {
      if (change === "delete") {
        // universal delete case
        contentMap.delete(file as FilePath)
      }

      // manually track non-markdown files as processed files only
      // contains markdown files
      if (change === "add" && path.extname(file) !== ".md") {
        contentMap.set(file as FilePath, {
          type: "other",
        })
      }
    }

    const changeEvents: ChangeEvent[] = Object.entries(changeLedger).map(([fp, type]) => {
      const path = fp as FilePath
      const processedContent = contentMap.get(path)
      if (processedContent?.type === "markdown") {
        const [_tree, file] = processedContent.content
        return {
          type,
          path,
          file,
        }
      }

      return {
        type,
        path,
      }
    })

    const currentContent = Array.from(contentMap.values())
      .filter((file) => file.type === "markdown")
      .map((file) => file.content)
    refreshDerivedContentState(ctx, Array.from(contentMap.keys()), currentContent)
    const processedFiles = filterContent(ctx, currentContent)

    let emittedFiles = 0
    for (const emitter of cfg.plugins.emitters) {
      // Try to use partialEmit if available, otherwise assume the output is static
      const emitFn = emitter.partialEmit ?? emitter.emit
      const emitted = await emitFn(ctx, processedFiles, staticResources, changeEvents)
      if (emitted === null) {
        continue
      }

      if (Symbol.asyncIterator in emitted) {
        // Async generator case
        for await (const file of emitted) {
          emittedFiles++
          if (ctx.argv.verbose) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      } else {
        // Array case
        emittedFiles += emitted.length
        if (ctx.argv.verbose) {
          for (const file of emitted) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      }
    }

    consumeChangeBatch(changes, batch, changesSinceLastBuild, changeLedger)
    console.log(
      `Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince("rebuild")}`,
    )
    console.log(styleText("green", `Done rebuilding in ${perf.timeSince()}`))
    clientRefresh()
  })
}

export default async (argv: Argv, mut: Mutex, clientRefresh: () => void) => {
  try {
    return await buildQuartz(argv, mut, clientRefresh)
  } catch (err) {
    trace("\nExiting Quartz due to a fatal error", err as Error)
  }
}
