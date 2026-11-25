import assert from "node:assert/strict"
import test from "node:test"
import { renderToString } from "preact-render-to-string"
import { RemoveDrafts } from "../plugins/filters/draft"
import { defaultProcessedContent, type ProcessedContent } from "../plugins/vfile"
import { filterContent } from "../processors/filter"
import { trieFromAllFiles, type BuildCtx } from "../util/ctx"
import { getDocumentFamily } from "../util/documentFamily"
import { type FilePath, slugifyFilePath } from "../util/path"
import { DocumentFamilyPage } from "./DocumentFamilyPage"

function page(name: string, title: string, frontmatter = {}, value = "") {
  const relativePath = `notes/example/${name}` as FilePath
  const result = defaultProcessedContent({
    relativePath,
    filePath: `content/${relativePath}` as FilePath,
    slug: slugifyFilePath(relativePath),
    frontmatter: { title, ...frontmatter },
  })
  result[1].value = value
  return result
}

const main = page("Start Here.md", "独立标题")
const marker = page("_family.md", "隐藏标记", { main: "Start Here.md" })

function render(content: ProcessedContent[]) {
  const ctx = {
    argv: { verbose: false },
    cfg: { plugins: { filters: [RemoveDrafts()] } },
  } as BuildCtx
  const published = filterContent(ctx, content)
  const folder = trieFromAllFiles(published.map(([, file]) => file.data)).findNode([
    "notes",
    "example",
  ])!
  return renderToString(
    <DocumentFamilyPage
      ctx={ctx}
      folder={folder}
      family={getDocumentFamily(ctx, folder.slug)!}
      sort={() => 0}
    />,
  )
}

test("published family follows real note and folder slugs, preserving empty intermediate groups", () => {
  const html = render([
    main,
    page("_family.md", "隐藏标记", { main: "Start Here.md" }, "<b>普通文本</b>"),
    page("sibling.md", "同层成员"),
    page("Middle/Deep Folder/index.md", "深层目录标题"),
    page("Middle/Deep Folder/sample.md", "深层笔记标题"),
    page("draft.md", "隐藏草稿", { draft: true }),
  ])
  assert.match(html, /这是一个笔记家族/)
  assert.match(
    html,
    /<\/section><p class="kfn-description">&lt;b(?:>|&gt;)普通文本&lt;\/b(?:>|&gt;)<\/p><nav/,
  )
  assert.equal(html.split("独立标题").length - 1, 1)
  assert.match(html, /href="\.\.\/\.\.\/notes\/example\/Start-Here"/)
  assert.match(html, /href="#kfn-notes" data-router-ignore/)
  assert.match(html, /id="kfn-notes"[^>]+tabindex="-1"/i)
  assert.match(html, /浏览 2 篇/)
  assert.match(html, /当前目录/)
  assert.match(html, /同层成员/)
  assert.match(html, /href="\.\.\/\.\.\/notes\/example\/Middle\/"[^>]*>Middle<span/)
  assert.match(html, /Middle \/ 深层目录标题/)
  assert.match(
    html,
    /href="\.\.\/\.\.\/notes\/example\/Middle\/Deep-Folder\/sample"[^>]*>深层笔记标题/,
  )
  assert.doesNotMatch(html, /隐藏标记|隐藏草稿|_family|<ul[^>]*><\/ul>/)
})

test("intro renders paired inline emphasis only, preserving line breaks and escaping HTML", () => {
  const intro = "先读**主笔记**。\n\n**<i>注释</i> & 说明**；<img src=x>；**未闭合"
  const html = render([main, page("_family.md", "标记", { main: "Start Here.md" }, intro)])
  assert.match(html, /<p class="kfn-description">先读<strong>主笔记<\/strong>。\n\n/)
  assert.match(html, /<strong>&lt;i(?:>|&gt;)注释&lt;\/i(?:>|&gt;) &amp; 说明<\/strong>/)
  assert.match(html, /；&lt;img src=x(?:>|&gt;)；\*\*未闭合<\/p>/)
})

test("adding or dropping a nested marker changes ownership, never the parent folder destination", () => {
  const members = [
    main,
    marker,
    page("child/main.md", "子家族专属"),
    page("child/inside/a.md", "深层专属"),
  ]
  const nested = render([...members, page("child/_family.md", "子标记", { main: "main.md" })])
  const ordinary = render(members)
  for (const html of [ordinary, nested])
    assert.match(html, /href="\.\.\/\.\.\/notes\/example\/child\/"/)
  assert.match(ordinary, /浏览 2 篇/)
  assert.match(ordinary, /子家族专属/)
  assert.match(ordinary, /深层专属/)
  assert.match(nested, /浏览 1 个目录/)
  assert.match(nested, /建议先读主笔记，再按需要浏览下方的子目录。/)
  assert.doesNotMatch(nested, /子家族专属|深层专属|child \/ inside|<ul/)
})

test("only-main family has no invented description, jump, or list", () => {
  const html = render([main, marker])
  assert.match(html, /可以从主笔记开始阅读。/)
  assert.match(html, /独立标题/)
  assert.doesNotMatch(html, /kfn-description|kfn-index|kfn-jump|kfn-notes|<ul/)
})
