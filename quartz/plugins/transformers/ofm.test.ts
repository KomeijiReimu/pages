import test from "node:test"
import assert from "node:assert/strict"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { VFile } from "vfile"
import { toHtml } from "hast-util-to-html"
import { visit } from "unist-util-visit"
import type { Root, Element } from "hast"
import type { Root as MdRoot } from "mdast"
import type { BuildCtx } from "../../util/ctx"
import type { FullSlug } from "../../util/path"
import type { QuartzComponentProps } from "../../components/types"
import { loadMarkdownTestModules } from "./test-utils"

const modules = await loadMarkdownTestModules()
const configuration = {
  locale: "zh-CN",
  pageTitle: "Synthetic fixture",
  defaultDateType: "modified",
}
const ctx = {
  argv: { directory: ".", verbose: false },
  cfg: { configuration },
  allSlugs: ["opencode", "referrer"],
  allFiles: [],
} as unknown as BuildCtx

async function parse(source: string, slug = "opencode", enableInHtmlEmbed = false) {
  const transformers = [
    modules.ObsidianFlavoredMarkdown({ enableInHtmlEmbed }),
    modules.GitHubFlavoredMarkdown(),
    modules.CrawlLinks({ markdownLinkResolution: "shortest" }),
  ]
  let input = source.trim()
  for (const transformer of transformers) input = transformer.textTransform?.(ctx, input) ?? input
  const file = new VFile({ path: `${slug}.md`, value: input })
  Object.assign(file.data, {
    slug,
    relativePath: `${slug}.md`,
    filePath: `${slug}.md`,
    frontmatter: { title: slug, tags: [] },
  })
  const md = unified()
    .use(remarkParse)
    .use(transformers.flatMap((p) => p.markdownPlugins?.(ctx) ?? []))
  const html = unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(transformers.flatMap((p) => p.htmlPlugins?.(ctx) ?? []))
  const tree = (await html.run((await md.run(md.parse(file), file)) as MdRoot, file)) as Root
  const elements: Element[] = []
  visit(tree, "element", (node) => {
    elements.push(node)
  })
  return {
    tree,
    file,
    html: toHtml(tree),
    ids: elements.filter((n) => n.properties.id).map((n) => n.properties.id),
    links: elements.filter((n) => n.tagName === "a"),
  }
}

function renderFixture(result: Awaited<ReturnType<typeof parse>>, files = [result.file.data]) {
  const blank = () => null
  const props = {
    ctx,
    cfg: ctx.cfg.configuration,
    fileData: result.file.data,
    tree: result.tree,
    allFiles: files,
    children: [],
    externalResources: { css: [], js: [] },
  } as unknown as QuartzComponentProps
  modules.renderPage(
    ctx.cfg.configuration,
    result.file.data.slug!,
    props,
    {
      head: blank,
      header: [],
      beforeBody: [],
      pageBody: blank,
      afterBody: [],
      left: [],
      right: [],
      footer: blank,
    },
    { css: [], js: [], additionalHead: [] },
  )
  return props.tree as Root
}

test("actual OFM/GFM/link pipeline aligns user same-page alias with the existing block ID", async () => {
  const result = await parse(
    [
      "下面，我将先介绍一些 opencode 我常用的配置字段。如果想先跳过这些介绍，并直接使用我的已有配置来快速开始，请[[#^jump-config|点击这里]]。",
      "",
      "请查看我的完整配置。 ^jump-config",
    ].join("\n"),
  )
  assert.deepEqual(result.ids, ["jump-config"])
  assert.equal(result.links[0].properties.href, "#jump-config")
  assert.match(result.html, />点击这里<\/a>/)
})

test("cross-file, mixed-case, encoded-caret and aliases preserve original block IDs", async () => {
  for (const id of ["exaexa", "AbC", "Ab-C_d", "__proto__", "constructor"]) {
    // Underscores that Markdown would otherwise interpret as emphasis must be escaped.
    const markdownId = id.replace(/_/g, "\\_")
    const target = await parse(
      `- \`websearch\`：包括 \`Exa\`、\`Firecrawl\`、\`Parallel\` 等。    ^${markdownId}   \n- 下一项`,
    )
    assert.ok(target.ids.includes(id))
    assert.equal(Object.getPrototypeOf(target.file.data.blocks), null)
    assert.ok(Object.hasOwn(target.file.data.blocks!, id))
    const reference = await parse(
      `[[opencode#^${markdownId}|原文]] [[#%5E${markdownId}|本页]]`,
      "referrer",
    )
    assert.deepEqual(
      reference.links.map((n) => n.properties.href),
      [`./opencode#${id}`, `#${id}`],
    )
  }
})

test("headings, PDF fragments and percent-encoded headings retain their own semantics", async () => {
  const result = await parse(
    "## 中文 Heading\n\n[[#中文 Heading|标题]] [[opencode#中文%20Heading]] [[file.pdf#page=2]]",
  )
  assert.ok(result.ids.includes("中文-heading"))
  assert.deepEqual(
    result.links.filter((n) => n.properties.role !== "anchor").map((n) => n.properties.href),
    ["#%E4%B8%AD%E6%96%87-heading", "./opencode#中文-heading", "./file.pdf#page=2"],
  )
})

test("escaped wikilinks and code are not converted to links or block registrations", async () => {
  const result = await parse(
    "\\[[#^AbC]]\n\n`[[#^AbC]] ^inline`\n\n```text\n[[#^AbC]] ^fenced\n```",
  )
  assert.equal(result.links.length, 0)
  assert.deepEqual(Object.keys(result.file.data.blocks!), [])
  const mixed = await parse("\\[[#^AbC|逃逸]] [[#^AbC|有效]]")
  assert.equal(mixed.links.length, 1)
  assert.equal(mixed.links[0].properties.href, "#AbC")
  const escapedBlock = await parse("paragraph \\^escaped")
  assert.deepEqual(Object.keys(escapedBlock.file.data.blocks!), [])
  assert.match(escapedBlock.html, /\^escaped/)
})

test("duplicate block IDs and heading/block collisions fail explicitly", async () => {
  await assert.rejects(parse("first ^same\n\nsecond ^same"), /Duplicate block reference "same"/)
  await assert.rejects(parse("# same\n\nparagraph ^same"), /Conflicting DOM ID.*same/)
  await assert.rejects(parse("paragraph ^same\n\n# same"), /Conflicting DOM ID.*same/)
  await assert.rejects(
    parse('<p id="existing">paragraph ^different</p>'),
    /conflicts with existing DOM ID/,
  )
})

test("opt-in HTML embeds still use the same block href serialization", async () => {
  const result = await parse("<div>[[#^Ab-C_d|块链接]]</div>", "opencode", true)
  assert.equal(result.links[0].properties.href, "#Ab-C_d")
})

test("block embeds retain internal type and render a case-sensitive source link", async () => {
  const target = await parse("- actual embedded content ^Ab-C_d")
  const reference = await parse("![[opencode#^Ab-C_d|嵌入别名]]", "referrer")
  assert.match(reference.html, /data-block="#\^Ab-C_d"/)
  assert.equal(reference.links[0].properties.href, "./opencode#Ab-C_d")
  const blank = () => null
  const componentData = {
    ctx,
    cfg: ctx.cfg.configuration,
    fileData: reference.file.data,
    tree: reference.tree,
    allFiles: [target.file.data, reference.file.data],
    children: [],
    externalResources: { css: [], js: [] },
  } as unknown as QuartzComponentProps
  modules.renderPage(
    ctx.cfg.configuration,
    "referrer" as FullSlug,
    componentData,
    {
      head: blank,
      header: [],
      beforeBody: [],
      pageBody: blank,
      afterBody: [],
      left: [],
      right: [],
      footer: blank,
    },
    { css: [], js: [], additionalHead: [] },
  )
  const rendered = toHtml(componentData.tree as Root)
  assert.match(rendered, /actual embedded content/)
  assert.match(rendered, /class="internal transclude-src"/)
  assert.match(rendered, /href="\.\/opencode#Ab-C_d"/)
  assert.doesNotMatch(rendered, /Transclude of/)
})

test("same-page block embeds and prototype-shaped IDs use own registry entries", async () => {
  for (const id of ["__proto__", "constructor"]) {
    const markdownId = id.replace(/_/g, "\\_")
    const result = await parse(`paragraph ^${markdownId}\n\n![[#^${markdownId}]]`)
    const blank = () => null
    const props = {
      ctx,
      cfg: ctx.cfg.configuration,
      fileData: result.file.data,
      tree: result.tree,
      allFiles: [result.file.data],
      children: [],
      externalResources: { css: [], js: [] },
    } as unknown as QuartzComponentProps
    modules.renderPage(
      ctx.cfg.configuration,
      "opencode" as FullSlug,
      props,
      {
        head: blank,
        header: [],
        beforeBody: [],
        pageBody: blank,
        afterBody: [],
        left: [],
        right: [],
        footer: blank,
      },
      { css: [], js: [], additionalHead: [] },
    )
    const rendered = toHtml(props.tree as Root)
    assert.match(rendered, /transclude-src/)
    assert.doesNotMatch(rendered, /Circular transclusion/)
    assert.ok(rendered.includes(`href="#${id}"`))
    assert.equal(rendered.split(`id="${id}"`).length - 1, 1)
  }
})

test("recursive same-page block embeds terminate instead of repeatedly cloning themselves", async () => {
  const result = await parse("> ![[#^loop]]\n\n^loop")
  const blank = () => null
  const props = {
    ctx,
    cfg: ctx.cfg.configuration,
    fileData: result.file.data,
    tree: result.tree,
    allFiles: [result.file.data],
    children: [],
    externalResources: { css: [], js: [] },
  } as unknown as QuartzComponentProps
  modules.renderPage(
    ctx.cfg.configuration,
    "opencode" as FullSlug,
    props,
    {
      head: blank,
      header: [],
      beforeBody: [],
      pageBody: blank,
      afterBody: [],
      left: [],
      right: [],
      footer: blank,
    },
    { css: [], js: [], additionalHead: [] },
  )
  assert.match(toHtml(props.tree as Root), /Circular transclusion detected/)
})

test("same-page block copies cannot steal descendant heading or block anchors from the original", async () => {
  const result = await parse("![[#^outer]]\n\n> ## Inside\n>\n> Text ^inner\n\n^outer")
  const tree = renderFixture(result)
  const ids: string[] = []
  const embeds: Element[] = []
  visit(tree, "element", (node) => {
    if (typeof node.properties.id === "string") ids.push(node.properties.id)
    if ((node.properties.className as string[] | undefined)?.includes("transclude"))
      embeds.push(node)
  })
  assert.deepEqual(ids, ["outer", "inside", "inner"])
  const copiedIds: string[] = []
  visit(embeds[0], "element", (node) => {
    if (typeof node.properties.id === "string") copiedIds.push(node.properties.id)
  })
  assert.deepEqual(copiedIds, [])
  assert.match(toHtml(embeds[0]), /href="#inside"/)
  assert.match(toHtml(embeds[0]), /href="#outer"/)
  assert.equal(result.file.data.blocks!.outer.properties.id, "outer")
  assert.equal(result.file.data.blocks!.inner.properties.id, "inner")
})

test("source guards distinguish repeated escaped/unescaped wikilinks after textTransform", async () => {
  const pair = String.raw`\[[#^AbC|same]] [[#^AbC|same]]`
  const result = await parse(
    `%% removed before parsing, so original offsets differ %%\n\n${Array(128).fill(pair).join(" ")}`,
  )
  assert.equal(result.links.length, 128)
  assert.ok(result.links.every((link) => link.properties.href === "#AbC"))
  assert.equal(result.html.split("[[#^AbC|same]]").length - 1, 128)

  const missingRawMatch = await parse(
    String.raw`[[#^\_\_proto\_\_|same]] \[[#^AbC|same]] [[#^AbC|same]]`,
  )
  assert.deepEqual(
    missingRawMatch.links.map((link) => link.properties.href),
    ["#__proto__", "#AbC"],
  )
})

test("an escaped alias cannot make a later escaped wikilink become a real link", async () => {
  const result = await parse(
    String.raw`[[note|same\_label]] \[[#^AbC|literal]] [[note|same_label]]`,
  )
  assert.equal(result.links.length, 2)
  assert.deepEqual(
    result.links.map((link) => link.properties.href),
    ["./note", "./note"],
  )
  assert.match(result.html, /\[\[#\^AbC\|literal\]\]/)
  assert.ok(result.links.every((link) => link.properties.href !== "#AbC"))
})

test("mixed page/block cycles terminate with the existing cycle diagnostic", async () => {
  const root = await parse("![[opencode]]\n\n> ![[opencode]]\n\n^outer", "referrer")
  const page = await parse("![[referrer#^outer]]", "opencode")
  const html = toHtml(renderFixture(root, [root.file.data, page.file.data]))
  assert.match(html, /Circular transclusion detected: opencode/)
  assert.ok(html.length < 10_000)

  const blockRoot = await parse("![[opencode#^outer]]", "referrer")
  const blockPage = await parse("> ![[referrer]]\n\n^outer", "opencode")
  const blockHtml = toHtml(renderFixture(blockRoot, [blockRoot.file.data, blockPage.file.data]))
  assert.match(blockHtml, /Circular transclusion detected: referrer/)
  assert.ok(blockHtml.length < 10_000)
})
