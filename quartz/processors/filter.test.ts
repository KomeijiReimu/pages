import assert from "node:assert/strict"
import test from "node:test"
import { RemoveDrafts } from "../plugins/filters/draft"
import { defaultProcessedContent } from "../plugins/vfile"
import type { BuildCtx } from "../util/ctx"
import { trieFromAllFiles } from "../util/ctx"
import { getDocumentFamily } from "../util/documentFamily"
import { FilePath, slugifyFilePath } from "../util/path"
import { filterContent } from "./filter"

function fixture() {
  const ctx = {
    argv: { verbose: false, directory: "content" },
    cfg: { plugins: { filters: [RemoveDrafts()] } },
    allFiles: [],
    allSlugs: [],
  } as unknown as BuildCtx
  const makePage = (filename: string, title: string) => {
    const relativePath = `notes/容器/docker/${filename}` as FilePath
    return defaultProcessedContent({
      filePath: `content/${relativePath}` as FilePath,
      relativePath,
      slug: slugifyFilePath(relativePath),
      frontmatter: { title },
    })
  }
  const marker = makePage("_family.md", "内部标记")
  marker[1].data.frontmatter!.main = "Docker 系统笔记.md"
  marker[1].value = "简介"
  const main = makePage("Docker 系统笔记.md", "独立标题")
  const ordinary = makePage("_family-notes.md", "普通相似名")
  return { ctx, marker, main, ordinary }
}

test("filters see candidate markers before registry creation; emitters receive only ordinary pages", () => {
  const { ctx, marker, main, ordinary } = fixture()
  const seen: string[] = []
  ctx.cfg.plugins.filters.push({
    name: "ObserveCandidates",
    shouldPublish(_ctx, [, file]) {
      seen.push(file.data.relativePath!)
      return true
    },
  })
  ctx.trie = trieFromAllFiles([marker[1].data, main[1].data])
  const published = filterContent(ctx, [marker, main, ordinary])
  assert.equal(seen.length, 3)
  assert.deepEqual(published, [main, ordinary])
  assert.equal(ctx.trie, undefined)
  const trie = trieFromAllFiles(published.map(([, file]) => file.data))
  assert.equal(trie.findNode(["notes", "容器", "docker", "_family"]), undefined)
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker/index")?.mainTitle, "独立标题")
})

test("draft markers are hidden and never activate a family", () => {
  const { ctx, marker, main } = fixture()
  marker[1].data.frontmatter!.draft = true
  assert.deepEqual(filterContent(ctx, [marker, main]), [main])
  assert.equal(ctx.documentFamilies?.size, 0)
})

test("missing, draft, or custom-filtered main cannot generate a link", () => {
  const originalWarn = console.warn
  const warnings: string[] = []
  console.warn = (message) => warnings.push(String(message))
  try {
    const { ctx, marker, main } = fixture()
    assert.deepEqual(filterContent(ctx, [marker]), [])
    assert.equal(ctx.documentFamilies?.size, 0)
    main[1].data.frontmatter!.draft = "true"
    assert.deepEqual(filterContent(ctx, [marker, main]), [])
    assert.equal(ctx.documentFamilies?.size, 0)
    main[1].data.frontmatter!.draft = false
    ctx.cfg.plugins.filters.push({ name: "Private", shouldPublish: (_ctx, item) => item !== main })
    assert.deepEqual(filterContent(ctx, [marker, main]), [])
    assert.equal(ctx.documentFamilies?.size, 0)
    assert.equal(warnings.length, 3)
  } finally {
    console.warn = originalWarn
  }
})

test("each full candidate snapshot replaces registry after marker edits, removal and main changes", () => {
  const { ctx, marker, main, ordinary } = fixture()
  filterContent(ctx, [marker, main, ordinary])
  const previousRegistry = ctx.documentFamilies
  main[1].data.frontmatter!.title = "更新标题"
  filterContent(ctx, [marker, main, ordinary])
  assert.notEqual(ctx.documentFamilies, previousRegistry)
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker")?.mainTitle, "更新标题")
  marker[1].data.frontmatter!.main = "_family-notes.md"
  marker[1].value = "新简介"
  filterContent(ctx, [marker, main, ordinary])
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker")?.mainSlug, ordinary[1].data.slug)
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker")?.description, "新简介")
  filterContent(ctx, [main, ordinary])
  assert.equal(ctx.documentFamilies?.size, 0)
  filterContent(ctx, [marker, main, ordinary])
  assert.equal(ctx.documentFamilies?.size, 1)
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    ordinary[1].data.frontmatter!.draft = true
    filterContent(ctx, [marker, main, ordinary])
    assert.equal(ctx.documentFamilies?.size, 0)
    marker[1].data.frontmatter!.main = null
    filterContent(ctx, [marker, main])
    assert.equal(ctx.documentFamilies?.size, 0)
  } finally {
    console.warn = originalWarn
  }
})
