import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { BuildCtx } from "../../util/ctx"
import { groupHighlightChunks, highlightGroupBudget } from "../../util/highlightSidecars"
import type { FilePath } from "../../util/path"
import type { StaticResources } from "../../util/resources"
import { defaultProcessedContent } from "../vfile"
import { HighlightSidecars } from "./highlightSidecars"

test("highlight groups have immutable references and a hard UTF-8 byte ceiling", () => {
  const chunks = Array.from({ length: 23 }, (_, i) => JSON.stringify(["春".repeat(1200) + i]))
  const files: Record<string, string> = {}
  const { hashes, groupSize } = groupHighlightChunks(chunks, files)
  assert.equal(groupSize, 8)
  assert.equal(hashes.length, 3)
  assert.deepEqual(
    hashes.flatMap((hash) => JSON.parse(files[hash])),
    chunks.map((c) => JSON.parse(c)),
  )
  chunks[11] = JSON.stringify(["changed"])
  const updated = groupHighlightChunks(chunks, files).hashes
  assert.equal(updated[0], hashes[0])
  assert.notEqual(updated[1], hashes[1])
  assert.equal(updated[2], hashes[2])
  const pathological = groupHighlightChunks([JSON.stringify(["春".repeat(25_000)])], files)
  assert.deepEqual(pathological.hashes, ["-"])
  assert.ok(Object.values(files).every((body) => Buffer.byteLength(body) <= highlightGroupBudget))
})

test("full and partial emission follow published owners, not unfiltered change events", async (t) => {
  const output = await mkdtemp(path.join(tmpdir(), "quartz-sidecars-"))
  t.after(() => rm(output, { recursive: true, force: true }))
  const dir = path.join(output, "static/highlight")
  const ctx = { argv: { output } } as BuildCtx
  const resources = {} as StaticResources
  const source = (value: string) => {
    const highlightSidecars = {}
    groupHighlightChunks([JSON.stringify([value])], highlightSidecars)
    return defaultProcessedContent({ highlightSidecars })
  }
  const a = source("published"),
    b = source("published"),
    draft = source("draft")
  const emitter = HighlightSidecars()
  const outputs = await Array.fromAsync(await emitter.emit(ctx, [a, b], resources))
  assert.equal(outputs.length, 1)
  const edited = source("edited")
  const change = (type: "change" | "delete", file?: (typeof a)[1]) => ({
    type,
    file,
    path: "a.md" as FilePath,
  })
  const partial = async (published: (typeof a)[], events: ReturnType<typeof change>[]) =>
    Array.fromAsync((await emitter.partialEmit!(ctx, published, resources, events))!)
  const added = await partial([edited, b], [change("change", edited[1])])
  assert.equal(added.length, 1)
  assert.equal(await readFile(outputs[0], "utf8"), '[["published"]]')
  assert.deepEqual(await partial([b], [change("change", draft[1])]), [])
  assert.deepEqual(await readdir(dir), [path.basename(outputs[0])])
  assert.deepEqual(await partial([], [change("delete")]), [])
  assert.deepEqual(await readdir(dir), [])
})
