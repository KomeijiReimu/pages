import assert from "node:assert/strict"
import fs from "node:fs"
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { resolve, basename } from "node:path"
import test from "node:test"
import type { Root } from "hast"
import { VFile } from "vfile"
import { ContentIndex } from "../../plugins/emitters/contentIndex"
import type { ProcessedContent } from "../../plugins/vfile"
import type { BuildCtx } from "../ctx"
import type { FilePath } from "../path"
import type { StaticResources } from "../resources"
import { SearchEngine } from "./engine"
import { extractSearchDocument } from "./extract"
import { assertManifest, type SearchManifest } from "./protocol"
import { element } from "./fixtures"

const text = (value: string) => ({ type: "text" as const, value })

test("snippet prefers a complete CJK query/word over early single characters, preserving document recall", () => {
  const tree: Root = {
    type: "root",
    children: [
      element("h2", [text("Intro")], { id: "intro" }),
      element("p", [text("alpha 中国介绍 " + "filler ".repeat(5000))]),
      element("h2", [text("Tail")], { id: "tail" }),
      element("p", [text("omega 中文末尾检索证据 beta")]),
    ],
  }
  const doc = extractSearchDocument(tree, { slug: "public/cjk", title: "CJK", tags: [] })
  assert.ok(doc.text.length > 34_000)
  const engine = new SearchEngine([doc])
  for (const query of ["中文末尾", "中文末尾 beta"]) {
    const hit = engine.search(query)[0]
    assert.ok(hit)
    assert.match(hit.preview, /中文末尾检索证据/)
    assert.match(hit.snippet, /中文末尾检索证据/)
    assert.equal(hit.anchor, "tail")
  }
  assert.equal(engine.search("alpha omega")[0]?.slug, "public/cjk")
  console.log("CJK window evidence", {
    textLength: doc.text.length,
    anchor: engine.search("中文末尾")[0].anchor,
  })
})

test("aria-hidden visible text remains searchable while truly hidden/executable content stays excluded", () => {
  const tree: Root = {
    type: "root",
    children: [
      element("p", [element("span", [text("ARIAVISIBLE_SENTINEL")], { ariaHidden: "true" })]),
      element("span", [text("REALLY_HIDDEN_SENTINEL")], { hidden: true }),
      ...["script", "style", "template"].map((tag) =>
        element(tag, [text(`${tag.toUpperCase()}_SENTINEL`)]),
      ),
    ],
  }
  const doc = extractSearchDocument(tree, { slug: "public/aria", title: "Aria", tags: [] })
  assert.match(doc.text, /ARIAVISIBLE_SENTINEL/)
  assert.doesNotMatch(
    doc.text,
    /REALLY_HIDDEN_SENTINEL|SCRIPT_SENTINEL|STYLE_SENTINEL|TEMPLATE_SENTINEL/,
  )
  assert.equal(new SearchEngine([doc]).search("ARIAVISIBLE_SENTINEL")[0]?.slug, "public/aria")
})

async function watchFixture() {
  const root = resolve(".quartz-cache/search-backend")
  await mkdir(root, { recursive: true })
  const output = await mkdtemp(resolve(root, "watch-"))
  const search = resolve(output, "static/search")
  const manifestFile = resolve(search, "manifest.json")
  const ctx = {
    argv: { output },
    cfg: { configuration: { defaultDateType: "modified", locale: "en-US" } },
  } as unknown as BuildCtx
  const plugin = ContentIndex({ enableRSS: false, enableSiteMap: false })
  const iterator = (rows: [string, string][]) => {
    const content = rows.map(([slug, value]): ProcessedContent => {
      const file = new VFile(value)
      file.data = {
        slug,
        relativePath: `${slug}.md`,
        frontmatter: { title: slug, tags: [] },
        text: value,
        links: [],
      } as unknown as VFile["data"]
      return [{ type: "root", children: [element("p", [text(value)])] }, file]
    })
    return plugin.emit(ctx, content, {} as StaticResources) as AsyncGenerator<FilePath>
  }
  const emit = async (rows: [string, string][]) => {
    for await (const _ of iterator(rows)) void _
  }
  const manifest = async () => {
    const value: unknown = JSON.parse(await readFile(manifestFile, "utf8"))
    assertManifest(value)
    return value
  }
  const names = (m: SearchManifest) => [m.worker.url, ...m.shards.map((s) => s.url)]
  const exists = async (m: SearchManifest) => {
    for (const name of names(m)) await access(resolve(search, name))
  }
  return { output, search, manifestFile, emit, iterator, manifest, names, exists }
}

test("consecutive real emits remove only obsolete manifest-owned hashed text on edit and deletion", async () => {
  const f = await watchFixture()
  await f.emit([
    ["edit", "OLD_EDIT_SENTINEL"],
    ["delete", "OLD_DELETE_SENTINEL"],
  ])
  const first = await f.manifest()
  const outside = resolve(f.output, "outside-keep.txt")
  const unrelated = resolve(f.search, `text.${"f".repeat(64)}.json`)
  await writeFile(outside, "outside safe")
  await writeFile(unrelated, "unreferenced safe")
  await writeFile(resolve(f.search, "keep.txt"), "nonasset safe")
  await f.emit([
    ["edit", "NEW_EDIT_SENTINEL"],
    ["delete", "OLD_DELETE_SENTINEL"],
  ])
  const second = await f.manifest()
  await f.exists(second)
  for (const name of f.names(first).filter((name) => !f.names(second).includes(name))) {
    await assert.rejects(access(resolve(f.search, name)), /ENOENT/)
  }
  await f.emit([["edit", "NEW_EDIT_SENTINEL"]])
  const third = await f.manifest()
  await f.exists(third)
  for (const name of f.names(second).filter((name) => !f.names(third).includes(name))) {
    await assert.rejects(access(resolve(f.search, name)), /ENOENT/)
  }
  assert.equal(third.documents, 1)
  const current = await readFile(resolve(f.search, third.shards[0].url), "utf8")
  assert.match(current, /NEW_EDIT_SENTINEL/)
  assert.doesNotMatch(current, /OLD_EDIT_SENTINEL|OLD_DELETE_SENTINEL/)
  assert.equal(await readFile(outside, "utf8"), "outside safe")
  assert.equal(await readFile(unrelated, "utf8"), "unreferenced safe")
  assert.equal(await readFile(resolve(f.search, "keep.txt"), "utf8"), "nonasset safe")
  console.log("watch edit/delete evidence", {
    output: f.output,
    removed: [...first.shards, ...second.shards].map((s) => s.url),
    current: third.shards[0].url,
  })
})

test("an aborted generator or failed manifest write preserves all previously referenced assets", async (t) => {
  const f = await watchFixture()
  await f.emit([["old", "STILL_LIVE_SENTINEL"]])
  const old = await f.manifest()
  const previousJson = await readFile(f.manifestFile, "utf8")
  const staged = f.iterator([["new", "STAGED_SENTINEL"]])
  const written: string[] = []
  for (let i = 0; i < 3; i++) written.push((await staged.next()).value)
  assert.notEqual(basename(written[2]), "manifest.json")
  await staged.return(undefined)
  assert.equal(await readFile(f.manifestFile, "utf8"), previousJson)
  await f.exists(old)
  const original = fs.promises.writeFile
  const replacement: typeof original = async (...args) => {
    if (String(args[0]) === f.manifestFile) throw new Error("INJECTED_MANIFEST_WRITE_FAILURE")
    return original(...args)
  }
  const mocked = t.mock.method(fs.promises, "writeFile", replacement)
  try {
    await assert.rejects(
      f.emit([["new", "FAILED_EMIT_SENTINEL"]]),
      /INJECTED_MANIFEST_WRITE_FAILURE/,
    )
  } finally {
    mocked.mock.restore()
  }
  assert.equal(await readFile(f.manifestFile, "utf8"), previousJson)
  await f.exists(old)
  console.log("manifest failure evidence", {
    output: f.output,
    oldManifestPreserved: true,
    oldAssetsPreserved: true,
  })
})

test("malformed previous manifest paths cannot authorize output-directory traversal cleanup", async () => {
  const f = await watchFixture()
  await f.emit([["old", "OLD_PUBLIC_SENTINEL"]])
  const old = await f.manifest()
  const outside = resolve(f.output, "outside-keep.txt")
  await writeFile(outside, "must survive")
  await writeFile(
    f.manifestFile,
    JSON.stringify({ ...old, shards: [{ ...old.shards[0], url: "../../outside-keep.txt" }] }),
  )
  await f.emit([["new", "NEW_PUBLIC_SENTINEL"]])
  await f.exists(await f.manifest())
  assert.equal(await readFile(outside, "utf8"), "must survive")
  await f.exists(old)
})
