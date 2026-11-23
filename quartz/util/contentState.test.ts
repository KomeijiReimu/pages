import assert from "node:assert/strict"
import test from "node:test"
import path from "node:path"
import { filterContent } from "../processors/filter"
import { defaultProcessedContent } from "../plugins/vfile"
import { BuildCtx, trieFromAllFiles } from "./ctx"
import { FilePath, FullSlug, SimpleSlug, slugifyFilePath } from "./path"
import {
  ChangeLedger,
  affectedFolderSlugs,
  consumeChangeBatch,
  familyPageChanges,
  recordChangeBatch,
  refreshDerivedContentState,
  transcludingPageChanges,
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

test("refresh transcluding pages through nested and circular embeds, not ordinary links", () => {
  const page = (slug: string, ...transcludes: string[]) =>
    defaultProcessedContent({
      relativePath: `${slug}.md` as FilePath,
      slug: slug as FullSlug,
      transcludes: transcludes as FullSlug[],
    })
  const source = page("source")
  const hosts = [page("inner", "source", "outer"), page("outer", "inner"), page("other")]
  hosts[2][1].data.links = ["source" as SimpleSlug]
  for (const type of ["add", "change", "delete"] as const) {
    const event = { type, path: "source.md" as FilePath }
    const published = type === "delete" ? hosts : [source, ...hosts]
    const expanded = transcludingPageChanges(testCtx(), published, [event])
    assert.deepEqual(
      expanded.map((e) => e.path),
      ["source.md", "inner.md", "outer.md"],
    )
  }
})

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

test("reserved markers and their aliases/permalinks never enter derived slugs", () => {
  const ctx = testCtx()
  const marker = defaultProcessedContent({
    filePath: "content/notes/topic/_family.md" as FilePath,
    relativePath: "notes/topic/_family.md" as FilePath,
    slug: "notes/topic/_family" as FullSlug,
    aliases: ["marker-alias" as FullSlug],
    permalink: "marker-permalink" as FullSlug,
    frontmatter: { title: "内部标记", permalink: "marker-frontmatter-permalink" },
  })
  const ordinary = defaultProcessedContent({
    filePath: "content/notes/topic/_family-notes.md" as FilePath,
    slug: "notes/topic/_family-notes" as FullSlug,
    aliases: ["ordinary-alias" as FullSlug],
    frontmatter: { title: "普通笔记" },
  })
  const physicalFiles = [
    "notes/topic/_family.md",
    "notes/topic/_family-notes.md",
    "notes/topic/image.png",
  ] as FilePath[]
  refreshDerivedContentState(ctx, physicalFiles, [marker, ordinary])
  assert.deepEqual(ctx.allFiles, physicalFiles)
  assert.deepEqual(ctx.allSlugs, [
    "notes/topic/_family-notes",
    "notes/topic/image.png",
    "ordinary-alias",
  ])
})

for (const scenario of [
  "add marker",
  "delete marker",
  "withdraw main",
  "edit folder title",
  "edit main title",
  "edit description",
]) {
  test(`family page dependencies: ${scenario}`, () => {
    const ctx = testCtx()
    ctx.cfg.plugins = {
      transformers: [],
      emitters: [],
      filters: [
        { name: "published", shouldPublish: (_, [, file]) => !file.data.frontmatter?.draft },
      ],
    }
    const page = (name: string) => {
      const relativePath = `${name}.md` as FilePath
      return defaultProcessedContent({
        relativePath,
        slug: slugifyFilePath(relativePath),
        frontmatter: { title: name },
      })
    }
    const marker = page("notes/Family A/_family")
    marker[1].value = "Family description"
    marker[1].data.frontmatter!.main = "main.md"
    const main = page("notes/Family A/main")
    const index = page("notes/Family A/_index")
    const pages = [
      page("index"),
      page("categories/index"),
      main,
      index,
      page("notes/Family A/deeper/note"),
      page("notes/Family AB/unrelated"),
    ]
    filterContent(ctx, scenario === "add marker" ? pages : [...pages, marker])
    const previous = ctx.documentFamilies

    const edited =
      scenario === "withdraw main" || scenario === "edit main title"
        ? main
        : scenario === "edit folder title"
          ? index
          : marker
    if (scenario === "withdraw main") main[1].data.frontmatter!.draft = true
    if (scenario === "edit main title" || scenario === "edit folder title")
      edited[1].data.frontmatter!.title = "New title"
    if (scenario === "edit description") marker[1].value = "New description"
    const published = filterContent(ctx, scenario === "delete marker" ? pages : [...pages, marker])
    const event: ChangeEvent = {
      type: scenario === "add marker" ? "add" : scenario === "delete marker" ? "delete" : "change",
      path: edited[1].data.relativePath!,
      file: scenario === "delete marker" ? undefined : edited[1],
    }
    const changes = [event]
    const expanded = familyPageChanges(ctx, previous, published, changes)
    if (scenario === "edit main title" || scenario === "edit description") {
      assert.equal(expanded, changes)
      return
    }
    assert.deepEqual(changes, [event], "other emitters retain the physical events")
    const refreshed = new Set(expanded.filter((e) => e.file).map((e) => e.file!.data.slug))
    assert.ok(refreshed.has("index" as FullSlug))
    assert.ok(refreshed.has("notes/Family-A/deeper/note" as FullSlug))
    assert.ok(!refreshed.has("notes/Family-AB/unrelated" as FullSlug))
    assert.deepEqual([...affectedFolderSlugs(ctx, expanded)].sort(), [
      "categories",
      "notes",
      "notes/Family-A",
      "notes/Family-A/deeper",
    ])
  })
}

test("folder refresh uses physical Markdown paths for marker create/change/delete and main edits", () => {
  const ctx = testCtx()
  ctx.argv.directory = "content"
  for (const type of ["add", "change", "delete"] as const) {
    for (const filename of ["_family.md", "Docker 系统笔记.md"]) {
      const affected = affectedFolderSlugs(ctx, [
        { type, path: `notes/容器/docker/${filename}` as FilePath },
      ])
      assert.deepEqual([...affected], ["notes/容器/docker", "notes/容器", "notes"])
    }
  }
  const main = defaultProcessedContent({ slug: "unrelated/overridden" as FullSlug })[1]
  assert.deepEqual(
    [
      ...affectedFolderSlugs(ctx, [
        { type: "change", path: "notes/容器/docker/Docker 系统笔记.md" as FilePath, file: main },
      ]),
    ],
    ["notes/容器/docker", "notes/容器", "notes"],
  )
  assert.deepEqual(
    [
      ...affectedFolderSlugs(ctx, [
        { type: "delete", path: path.resolve("content/notes/容器/docker/_family.md") as FilePath },
      ]),
    ],
    ["notes/容器/docker", "notes/容器", "notes"],
  )
  assert.deepEqual(
    [
      ...affectedFolderSlugs(ctx, [
        { type: "change", path: "notes/中文 空格/_family.md" as FilePath },
      ]),
    ],
    ["notes/中文-空格", "notes"],
  )
  assert.deepEqual(
    [...affectedFolderSlugs(ctx, [{ type: "delete", path: "index.md" as FilePath }])],
    [],
  )
  assert.deepEqual(
    [...affectedFolderSlugs(ctx, [{ type: "delete", path: "tags/topic.md" as FilePath }])],
    [],
  )
  assert.deepEqual(
    [...affectedFolderSlugs(ctx, [{ type: "change", path: "image.png" as FilePath }])],
    [],
  )
  assert.deepEqual(
    [...affectedFolderSlugs(ctx, [{ type: "change", path: "image.png" as FilePath, file: main }])],
    ["unrelated"],
  )
  // A nested folder named like the input directory is still a relative watcher path.
  assert.deepEqual(
    [
      ...affectedFolderSlugs(ctx, [
        { type: "delete", path: "content/topic/_family.md" as FilePath },
      ]),
    ],
    ["content/topic", "content"],
  )
})
