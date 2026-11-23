import { readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ProcessedContent } from "../plugins/vfile"
import type { BuildCtx } from "../util/ctx"
import { maxSpaResponseBytes } from "../util/nativeRoutes"
import { getAllSegmentPrefixes } from "../util/path"

export const htmlPageEmitters = new Set(["ContentPage", "FolderPage", "TagPage", "404Page"])

// Retain only positive hints between watch emits. A clean emit resets this snapshot.
const snapshots = new WeakMap<BuildCtx, { script: string; large: Set<string>; prefix: string }>()

export async function finalizeNativeRoutes(
  ctx: BuildCtx,
  content: ProcessedContent[],
  htmlFiles: Set<string>,
  full: boolean,
) {
  if (!ctx.cfg.plugins.emitters.some((e) => e.name === "ComponentResources")) return
  const previous = full ? undefined : snapshots.get(ctx)
  const output = ctx.argv.output
  const bundle = path.join(output, "postscript.js")
  const script = previous?.script ?? (await readFile(bundle, "utf8"))
  // A partial emitter may leave an obsolete tag file or emit a folder for a draft
  // change. Intersect its real writes with routes backed by the current publication.
  const published = new Set(["404", "tags/index"])
  for (const [, file] of content) {
    const slug = file.data.slug!
    if (!slug.startsWith("tags/")) published.add(slug)
    for (const folder of getAllSegmentPrefixes(slug).slice(0, -1)) {
      if (folder !== "tags") published.add(`${folder}/index`)
    }
    for (const tag of (file.data.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes)) {
      published.add(`tags/${tag}`)
    }
  }
  const large = new Set(previous?.large)
  for (const slug of large) if (!published.has(slug)) large.delete(slug)
  await Promise.all(
    Array.from(htmlFiles, async (file) => {
      const slug = path.relative(output, file).split(path.sep).join("/").slice(0, -5)
      if (!published.has(slug)) return
      if ((await stat(file)).size > maxSpaResponseBytes) large.add(slug)
      else large.delete(slug)
    }),
  )

  const paths = new Set<string>()
  for (const slug of large) {
    const route = "/" + slug.split("/").map(encodeURIComponent).join("/")
    const key = route.replace(/\/index$/, "/")
    paths.add(route) // explicit /index and /index.html are real files, not generic slash aliases
    paths.add(key)
    // A leaf and a directory index may coexist. Don't mark its short alias
    // when it would select the other document.
    if (key.endsWith("/") && key !== "/" && !published.has(slug.slice(0, -6)))
      paths.add(key.slice(0, -1))
    if (!key.endsWith("/") && !published.has(`${slug}/index`)) paths.add(key + "/")
  }
  const prefix = `window.quartzNativeRoutes=new Set(${JSON.stringify([...paths].sort())});\n`
  if (prefix !== previous?.prefix) await writeFile(bundle, prefix + script)
  snapshots.set(ctx, { script, large, prefix })
}
