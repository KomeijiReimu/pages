import assert from "node:assert/strict"
import test from "node:test"
import { defaultProcessedContent } from "../plugins/vfile"
import { BuildCtx, trieFromAllFiles } from "./ctx"
import { FilePath, FullSlug } from "./path"
import {
  ChangeLedger,
  consumeChangeBatch,
  recordChangeBatch,
  refreshDerivedContentState,
} from "./contentState"
import { ChangeEvent } from "../plugins/types"

function testCtx(): BuildCtx {
  return {
    buildId: "test",
    argv: {} as BuildCtx["argv"],
    cfg: {} as BuildCtx["cfg"],
    allFiles: [],
    allSlugs: [],
    trie: {} as BuildCtx["trie"],
    incremental: true,
  }
}

test("derived content state invalidates trie and replaces aliases", () => {
  const ctx = testCtx()
  const content = defaultProcessedContent({
    aliases: ["old-alias" as FullSlug],
    permalink: "direct-link" as FullSlug,
    slug: "folder/page" as FullSlug,
    filePath: "folder/page.md" as FilePath,
    frontmatter: { title: "Old title", permalink: "permalink" },
  })
  const unchangedContent = defaultProcessedContent({
    aliases: ["stable-alias" as FullSlug],
    slug: "stable/page" as FullSlug,
    filePath: "stable/page.md" as FilePath,
    frontmatter: { title: "Stable title" },
  })
  ctx.trie = trieFromAllFiles([content[1].data, unchangedContent[1].data])
  assert.equal(ctx.trie.findNode(["folder", "page"])?.displayName, "Old title")

  refreshDerivedContentState(
    ctx,
    ["folder/page.md" as FilePath, "folder/image.png" as FilePath, "stable/page.md" as FilePath],
    [content, unchangedContent],
  )
  assert.deepEqual(ctx.allFiles, ["folder/page.md", "folder/image.png", "stable/page.md"])
  assert.deepEqual(ctx.allSlugs, [
    "folder/page",
    "folder/image.png",
    "stable/page",
    "old-alias",
    "direct-link",
    "permalink",
    "stable-alias",
  ])
  assert.equal(ctx.trie, undefined)

  content[1].data.aliases = ["new-alias" as FullSlug]
  content[1].data.permalink = undefined
  content[1].data.slug = "renamed/page" as FullSlug
  content[1].data.filePath = "renamed/page.md" as FilePath
  content[1].data.frontmatter = { title: "New title", permalink: "new-permalink" }
  ctx.trie = {} as BuildCtx["trie"]
  refreshDerivedContentState(
    ctx,
    ["renamed/page.md" as FilePath, "stable/page.md" as FilePath],
    [content, unchangedContent],
  )

  assert.deepEqual(ctx.allFiles, ["renamed/page.md", "stable/page.md"])
  assert.deepEqual(ctx.allSlugs, [
    "renamed/page",
    "stable/page",
    "new-alias",
    "new-permalink",
    "stable-alias",
  ])
  assert.equal(ctx.trie, undefined)

  const rebuiltTrie = trieFromAllFiles([content[1].data, unchangedContent[1].data])
  assert.equal(rebuiltTrie.findNode(["folder", "page"]), undefined)
  assert.equal(rebuiltTrie.findNode(["renamed", "page"])?.displayName, "New title")
  assert.equal(rebuiltTrie.findNode(["stable", "page"])?.displayName, "Stable title")
  assert.ok(rebuiltTrie.ancestryChain(["renamed", "page"]))
})

test("change ledger consumes only the successful batch", () => {
  const first = { path: "first.md" as FilePath, type: "change" } as const
  const second = { path: "second.md" as FilePath, type: "add" } as const
  const pending: ChangeEvent[] = [first]
  const ledger: ChangeLedger = {}
  const batch = pending.slice()
  const consumed = recordChangeBatch(ledger, batch)

  // A watcher event arriving during the build remains outside its snapshot.
  pending.push(second)
  ledger[second.path] = second.type
  consumeChangeBatch(pending, batch, ledger, consumed)

  assert.deepEqual(pending, [second])
  assert.deepEqual(ledger, { "second.md": "add" })

  const nextBatch = pending.slice()
  const nextConsumed = recordChangeBatch(ledger, nextBatch)
  consumeChangeBatch(pending, nextBatch, ledger, nextConsumed)
  assert.deepEqual(pending, [])
  assert.deepEqual(ledger, {})
})
