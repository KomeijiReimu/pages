import assert from "node:assert/strict"
import test from "node:test"
import { defaultProcessedContent, type ProcessedContent } from "../plugins/vfile"
import type { BuildCtx } from "./ctx"
import { FilePath, slugifyFilePath } from "./path"
import {
  buildDocumentFamilies,
  getDocumentFamily,
  isDocumentFamilyMarker,
  isDocumentFamilyMarkerPath,
} from "./documentFamily"

function page(filename: string, title: string, main?: unknown, body = ""): ProcessedContent {
  const relativePath = `notes/容器/docker/${filename}` as FilePath
  const item = defaultProcessedContent({
    filePath: `content/${relativePath}` as FilePath,
    relativePath,
    slug: slugifyFilePath(relativePath),
    frontmatter: { title, main },
  })
  item[1].value = body
  return item
}

test("explicit Chinese filename with spaces and ./ resolves by path, never title", () => {
  const main = page("Docker 系统笔记.md", "容器知识总览")
  const decoy = page("docker.md", "Docker 系统笔记.md")
  const marker = page(
    "_family.md",
    "内部标记",
    "./Docker 系统笔记.md",
    '---\nmain: "./Docker 系统笔记.md"\n---\n第一段。\n\n第二段。\n<script>alert("text")</script>\n',
  )
  const families = buildDocumentFamilies([marker, decoy, main])
  assert.deepEqual(families.get("notes/容器/docker"), {
    mainSlug: "notes/容器/docker/Docker-系统笔记",
    mainTitle: "容器知识总览",
    description: '第一段。\n\n第二段。\n<script>alert("text")</script>',
  })
  const ctx = { documentFamilies: families } as BuildCtx
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker/index"), families.get("notes/容器/docker"))
  assert.equal(getDocumentFamily(ctx, "/notes/容器/docker/"), families.get("notes/容器/docker"))
  assert.equal(getDocumentFamily(ctx, "notes/容器/docker/child/index"), undefined)
  assert.equal(getDocumentFamily(ctx, "notes/容器/index"), undefined)
  assert.equal(getDocumentFamily({} as BuildCtx, "notes/容器/docker"), undefined)
})

test("empty marker bodies stay empty; CRLF normalizes without losing paragraphs", () => {
  const main = page("Docker 系统笔记.md", "主笔记")
  for (const body of [
    "",
    "  \n\n ",
    "---\nmain: Docker 系统笔记.md\n---",
    "---\nmain: Docker 系统笔记.md\n---\n\n",
  ]) {
    const families = buildDocumentFamilies([
      page("_family.md", "标记", "Docker 系统笔记.md", body),
      main,
    ])
    assert.equal(families.get("notes/容器/docker")?.description, "")
  }
  const families = buildDocumentFamilies([
    page(
      "_family.md",
      "标记",
      "Docker 系统笔记.md",
      "---\r\nmain: Docker 系统笔记.md\r\n---\r\n段一\r\n\r\n段二",
    ),
    main,
  ])
  assert.equal(families.get("notes/容器/docker")?.description, "段一\n\n段二")
})

test("invalid or unavailable main warns without exposing its value or marker body", () => {
  const main = page("Docker 系统笔记.md", "主笔记")
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    for (const invalid of [
      undefined,
      null,
      "",
      "  ",
      42,
      true,
      [],
      {},
      "missing.md",
      "../Docker 系统笔记.md",
      "sub/Docker 系统笔记.md",
      "./../Docker 系统笔记.md",
      "/Docker 系统笔记.md",
      "https://secret.invalid/file.md",
      "index.md",
      "./index.md",
      "_index.md",
      "_family.md",
      "./_family.md",
      "Docker 系统笔记",
      "Docker 系统笔记.md#fragment",
      "..\\secret.md",
      "%2e%2e%2fsecret.md",
      "bad\u0000.md",
    ]) {
      assert.equal(
        buildDocumentFamilies([page("_family.md", "标记", invalid, "secret-body"), main]).size,
        0,
      )
    }
    assert.equal(warnings.length, 24)
    assert.ok(warnings.every((warning) => !warning.includes("secret") && !warning.includes("<")))
  } finally {
    console.warn = originalWarn
  }
})

test("a same-title page, alias, or parent file is not a substitute for the exact sibling", () => {
  const marker = page("_family.md", "标记", "missing.md")
  const decoy = page("decoy.md", "missing.md")
  decoy[1].data.aliases = [slugifyFilePath("notes/容器/docker/missing.md" as FilePath)]
  const parent = page("missing.md", "祖先笔记")
  parent[1].data.filePath = "content/notes/容器/missing.md" as FilePath
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(buildDocumentFamilies([marker, decoy, parent]).size, 0)
  } finally {
    console.warn = originalWarn
  }
})

test("only the exact reserved filename is a marker", () => {
  assert.equal(isDocumentFamilyMarkerPath("notes/_family.md"), true)
  assert.equal(isDocumentFamilyMarker(page("_family.md", "标记")[1].data), true)
  for (const filename of [
    "_family-notes.md",
    "family.md",
    "_Family.md",
    "_family.md.txt",
    "_family.MD",
  ]) {
    assert.equal(isDocumentFamilyMarkerPath(`notes/${filename}`), false)
    assert.equal(isDocumentFamilyMarker(page(filename, "普通笔记")[1].data), false)
  }
  const similar = page("_family-notes.md", "普通笔记")
  similar[1].data.slug = slugifyFilePath("notes/_family.md" as FilePath)
  assert.equal(isDocumentFamilyMarker(similar[1].data), false)
})
