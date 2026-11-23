import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { build } from "esbuild"
import { transcludingPageChanges } from "../../util/contentState"
import type { BuildCtx } from "../../util/ctx"
import { groupHighlightChunks } from "../../util/highlightSidecars"
import type { FilePath, FullSlug } from "../../util/path"
import type { ChangeEvent } from "../types"
import { defaultProcessedContent, type ProcessedContent } from "../vfile"
import { HighlightSidecars } from "./highlightSidecars"

// Bundle the real SSR components without loading browser scripts or writing CLI caches.
const bundle = await build({
  entryPoints: [path.join(import.meta.dirname, "folderPage.tsx")],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  loader: { ".scss": "text" },
  plugins: [
    {
      name: "folder-test-resources",
      setup(builder) {
        builder.onLoad({ filter: /\.inline\.ts$/ }, () => ({ contents: 'export default ""' }))
        builder.onResolve({ filter: /^[^./]/ }, ({ path }) => ({
          path: import.meta.resolve(path),
          external: true,
        }))
      },
    },
  ],
})
const { FolderPage } = (await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
)) as typeof import("./folderPage")

function note(slug: string, groups: string[] = [], embed?: string) {
  const filePath = `${slug}.md` as FilePath
  const files: Record<string, string> = {}
  const page = defaultProcessedContent({
    relativePath: filePath,
    filePath,
    slug: slug as FullSlug,
    frontmatter: { title: slug, tags: [] },
    highlightSidecars: files,
    transcludes: embed ? [embed as FullSlug] : [],
  })
  for (const value of groups) {
    const { hashes } = groupHighlightChunks([JSON.stringify([value])], files)
    page[0].children.push({
      type: "element",
      tagName: "pre",
      properties: { dataKomeiCodeGroups: hashes.join(" ") },
      children: [{ type: "text", value }],
    })
  }
  if (embed)
    page[0].children.push({
      type: "element",
      tagName: "blockquote",
      properties: { className: ["transclude"] },
      children: [
        { type: "element", tagName: "a", properties: { "data-slug": embed }, children: [] },
      ],
    })
  page[1].data.htmlAst = page[0]
  return page
}

function outputs(output: string) {
  const ctx = {
    argv: { output, watch: true },
    cfg: { configuration: { locale: "en-US" } },
  } as BuildCtx
  const resources = { css: [], js: [], additionalHead: [] }
  const folders = FolderPage({
    head: () => null,
    header: [],
    left: [],
    right: [],
    beforeBody: [],
    afterBody: [],
    footer: () => null,
  })
  const sidecars = HighlightSidecars()
  return async (content: ProcessedContent[], changes?: ChangeEvent[]) => {
    ctx.trie = undefined
    const pages = changes
      ? await folders.partialEmit!(
          ctx,
          content,
          resources,
          transcludingPageChanges(ctx, content, changes),
        )
      : await folders.emit(ctx, content, resources)
    const rendered = await Array.fromAsync(pages!)
    const groups = changes
      ? await sidecars.partialEmit!(ctx, content, resources, changes)
      : await sidecars.emit(ctx, content, resources)
    await Array.fromAsync(groups!)
    return rendered.map((p) => path.relative(output, p)).sort()
  }
}

test("folder descriptions and resolved embed hosts refresh before highlight groups are pruned", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "quartz-folder-watch-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const watch = path.join(dir, "watch"),
    clean = path.join(dir, "clean")
  const emit = outputs(watch)
  const old = note("topic", ["old", "shared"]),
    edited = note("topic", ["new"])
  const others = [
    note("topic/child"),
    note("inner", [], "topic"),
    note("inner/child"),
    note("outer", [], "inner"),
    note("outer/child"),
    note("unrelated/index", ["shared", "unrelated"]),
    note("lonely"),
  ]
  const html = (output: string, folder: string) =>
    readFile(path.join(output, folder, "index.html"), "utf8")
  const refs = (html: string) =>
    [...html.matchAll(/data-komei-code-groups="([a-f0-9 ]+)"/g)].flatMap((m) => m[1].split(" "))
  const oldHashes = Object.keys(old[1].data.highlightSidecars!)
  const newHashes = Object.keys(edited[1].data.highlightSidecars!)
  const hosts = ["inner", "outer", "topic"]
  await emit([old, ...others])
  for (const host of hosts) assert.deepEqual(refs(await html(watch, host)), oldHashes)

  const content = [edited, ...others]
  const rendered = await emit(content, [
    { type: "change", path: "topic.md" as FilePath, file: edited[1] },
    { type: "change", path: "lonely.md" as FilePath },
  ])
  assert.deepEqual(
    rendered,
    hosts.map((host) => `${host}/index.html`),
  )
  await assert.rejects(html(watch, "lonely"), { code: "ENOENT" })
  for (const host of hosts) assert.deepEqual(refs(await html(watch, host)), newHashes)

  const allPages = await outputs(clean)(content)
  for (const page of allPages) {
    const current = await readFile(path.join(watch, page), "utf8")
    assert.equal(current, await readFile(path.join(clean, page), "utf8"))
    for (const hash of refs(current)) {
      const group = path.join("static/highlight", `${hash}.json`)
      assert.equal(
        await readFile(path.join(watch, group), "utf8"),
        await readFile(path.join(clean, group), "utf8"),
      )
    }
  }
  const live = await readdir(path.join(watch, "static/highlight"))
  assert.deepEqual(live.sort(), (await readdir(path.join(clean, "static/highlight"))).sort())
  assert.ok(!live.includes(`${oldHashes[0]}.json`))
  assert.ok(live.includes(`${oldHashes[1]}.json`))

  const index = note("topic/index", ["explicit"])
  for (const withIndex of [
    [index, ...content],
    [...content, index],
  ]) {
    await emit(withIndex, [{ type: "add", path: "topic/index.md" as FilePath, file: index[1] }])
    assert.deepEqual(
      refs(await html(watch, "topic")),
      Object.keys(index[1].data.highlightSidecars!),
    )
  }
  await emit(content, [{ type: "delete", path: "topic/index.md" as FilePath }])
  assert.deepEqual(refs(await html(watch, "topic")), newHashes)
})
