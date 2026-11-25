import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test, { type TestContext } from "node:test"
import { h } from "preact"
import { renderToString } from "preact-render-to-string"
import { remark } from "remark"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import { filterContent } from "../../processors/filter"
import HomeHero from "../../components/HomeHero"
import type { QuartzComponentProps } from "../../components/types"
import type { BuildCtx } from "../../util/ctx"
import type { FilePath, FullSlug } from "../../util/path"
import { RemoveDrafts } from "../filters/draft"
import { GitHubFlavoredMarkdown } from "../transformers/gfm"
import { defaultProcessedContent } from "../vfile"
import { ChangelogFeed } from "./changelogFeed"

async function fixture(t: TestContext) {
  const output = await mkdtemp(path.join(tmpdir(), "changelog-feed-test-"))
  t.after(() => rm(output, { recursive: true, force: true }))
  const ctx = {
    argv: { output },
    cfg: {
      configuration: { baseUrl: "blog.komeijireimu.top", pageTitle: "A&B" },
      plugins: { filters: [RemoveDrafts()] },
    },
  } as BuildCtx
  const resources = { js: [], css: [], additionalHead: [] }
  const processor = remark()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(GitHubFlavoredMarkdown().htmlPlugins!(ctx))
  const page = async (md: string, slug = "changelog/index") => {
    const result = defaultProcessedContent({ slug: slug as FullSlug, frontmatter: { title: slug } })
    result[0] = await processor.run(processor.parse(md))
    return result
  }
  const read = () => readFile(path.join(output, "changelog/feed.xml"), "utf8")
  return { ctx, resources, page, read, emitter: ChangelogFeed() }
}

test("homepage RSS opens a local chooser with a reader link and a selectable changelog URL", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("subscription markup needs no requests"))
  const { ctx, resources, emitter, read } = await fixture(t)
  ctx.cfg.configuration.baseUrl = "library.example.invalid/preview/"
  const props = { cfg: ctx.cfg.configuration, fileData: { slug: "index" } } as QuartzComponentProps
  const home = renderToString(h(HomeHero(), props))
  const icons = home.match(/<a\b[^>]*class="[^"]*\bkomei-profile-link--icon\b[^"]*"[^>]*>/g) ?? []
  assert.equal(icons.length, 3)
  const entry = icons.find((tag) => tag.includes('aria-label="订阅 RSS"'))
  assert.ok(entry)
  assert.doesNotMatch(entry, /application\/rss\+xml|\.xml/)
  const href = entry.match(/href="([^"]+)"/)![1]
  assert.equal(href, "./changelog/subscribe/")

  await emitter.emit(ctx, [], resources)
  // Follow the generated homepage href on disk, without loading the actual reader.
  const chooser = await readFile(path.join(ctx.argv.output, href, "index.html"), "utf8")
  const feedUrl = "https://library.example.invalid/preview/changelog/feed.xml"
  assert.match(await read(), /<rss version="2.0">/)
  assert.match(chooser, /<h1>订阅 RSS<\/h1>/)
  assert.match(chooser, /<label for="rss-address">RSS 订阅地址<\/label>/)
  const address = chooser.match(/<input\b[^>]*\bid="rss-address"[^>]*>/)![0]
  assert.match(address, /\breadonly\b/i)
  assert.ok(address.includes(`value="${feedUrl}"`))
  const reader = chooser.match(/<a\b[^>]*href="(https:[^"]+)"[^>]*>在 Feedly 中订阅/)![1]
  assert.equal(reader, `https://feedly.com/i/subscription/${encodeURIComponent(`feed/${feedUrl}`)}`)
  // Only the existing same-origin theme prescript runs, before the stylesheet and first paint.
  const themeScript = '<script src="../../prescript.js"></script>'
  assert.ok(chooser.includes(`${themeScript}<link rel="stylesheet"`))
  assert.doesNotMatch(chooser.replace(themeScript, ""), /<(?:script|iframe|form|img)\b|\sonclick=/i)
})

test("production h2 year / h3 month-day format: real anchors, one item per calendar day", async (t) => {
  const { ctx, resources, page, read, emitter } = await fixture(t)
  const log = await page(`## 2026
### 10 月 21 日
- 更新 [opencode](../notes/Agent/opencode/opencode)，示例：\`<A&B>]]>\`。
- 第二条

<pre><code>保留代码</code><script type="application/json">高亮载荷</script></pre>
<blockquote class="transclude"><a href="../notes/private">嵌入其他笔记</a></blockquote>

### 10 月 21 日
当天补充
### 非日期小节
不属于日期
## 2025
### 10 月 21 日
旧记录
### 2 月 29 日
无效日期
## 其他说明
### 1 月 1 日
不属于年份`)
  await emitter.emit(
    ctx,
    [log, await page("## 2030\n### 1 月 1 日\n其他笔记", "notes/x")],
    resources,
  )
  const xml = await read()
  assert.match(xml, /<title>A&amp;B · 更新日志<\/title>/)
  assert.match(xml, /<description>按日期发布的更新日志<\/description>/)
  assert.match(xml, /<title>2026-10-21 更新日志<\/title>/)
  assert.equal(xml.match(/<item>/g)?.length, 2)
  const [recent, old] = xml.split("<item>").slice(1)
  assert.match(recent, /<guid isPermaLink="false">changelog:2026-10-21<\/guid>/)
  assert.match(recent, /<pubDate>Wed, 21 Oct 2026 00:00:00 GMT<\/pubDate>/)
  assert.match(recent, /更新 opencode/)
  assert.match(recent, /&amp;lt;A&amp;amp;B&amp;gt;\]\]&amp;gt;/)
  assert.match(recent, /&lt;br&gt;• 第二条/)
  assert.match(recent, /保留代码/)
  assert.match(recent, /当天补充/)
  assert.match(old, /changelog:2025-10-21/)
  const links = [recent, old].map((item) => decodeURI(item.match(/<link>(.*?)<\/link>/)![1]))
  assert.deepEqual(links, [
    "https://blog.komeijireimu.top/changelog/#10-月-21-日",
    "https://blog.komeijireimu.top/changelog/#10-月-21-日-2",
  ])
  assert.doesNotMatch(xml, /其他笔记|无效日期|不属于|高亮载荷|嵌入|\.\.\/|anchor|svg/)
})

test("rebuilds retain identities and overwrite removed or unpublished entries with an empty feed", async (t) => {
  const { ctx, resources, page, read, emitter } = await fixture(t)
  const old = await page("## 2024\n### 2 月 29 日\n旧内容")
  await emitter.emit(ctx, [], resources)
  const empty = await read()
  assert.match(empty, /<rss version="2.0"><channel>/)
  assert.doesNotMatch(empty, /<item>/)
  await emitter.emit(ctx, [old], resources)
  const original = await read()
  const changed = await page("## 2024\n### 2 月 29 日\n已修正")
  const future = new Date("2040-05-06T12:34:56Z")
  changed[1].data.dates = { created: future, modified: future, published: future }
  const event = {
    type: "change",
    path: "changelog/index.md" as FilePath,
    file: changed[1],
  } as const
  await emitter.partialEmit!(ctx, [changed], resources, [event])
  const updated = await read()
  assert.equal(updated, original.replace("旧内容", "已修正"))
  assert.equal(
    await emitter.partialEmit!(ctx, [], resources, [
      { type: "change", path: "notes/x.md" as FilePath },
    ]),
    null,
  )
  assert.equal(await read(), updated)

  changed[1].data.frontmatter!.draft = true
  await emitter.partialEmit!(ctx, filterContent(ctx, [changed]), resources, [event])
  assert.equal(await read(), empty)
  await emitter.emit(ctx, [old], resources)
  await emitter.partialEmit!(ctx, [], resources, [{ type: "delete", path: event.path }])
  assert.equal(await read(), empty)
})
