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
import { extractSearchDocument } from "../../util/search/extract"
import { SearchEngine } from "../../util/search/engine"

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

type ParseHooks = {
  markdown?: (tree: MdRoot) => void
  afterRawHtml?: (tree: Root) => void
}

async function parse(
  source: string,
  slug = "opencode",
  enableInHtmlEmbed = false,
  hooks: ParseHooks = {},
) {
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
  const md = unified().use(remarkParse)
  if (hooks.markdown) md.use(() => (tree: MdRoot) => hooks.markdown!(tree))
  md.use(transformers.flatMap((p) => p.markdownPlugins?.(ctx) ?? []))
  const htmlPlugins = transformers.flatMap((p) => p.htmlPlugins?.(ctx) ?? [])
  const html = unified().use(remarkRehype, { allowDangerousHtml: true })
  if (hooks.afterRawHtml) {
    // OFM's first HTML plugin is the actual rehypeRaw; inspect/mutate its output.
    html.use(htmlPlugins.slice(0, 1)).use(() => (tree: Root) => hooks.afterRawHtml!(tree))
    html.use(htmlPlugins.slice(1))
  } else {
    html.use(htmlPlugins)
  }
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

test("internally escaped source markers retain caret escape parity across production blocks", async (t) => {
  const shapes: {
    name: string
    task?: boolean
    loose?: boolean
    wrapped?: boolean
    formatted?: boolean
  }[] = [
    { name: "paragraph" },
    { name: "tight task", task: true },
    { name: "loose task", task: true, loose: true },
    { name: "wrapped paragraph", wrapped: true },
    { name: "wrapped tight task", task: true, wrapped: true },
    { name: "wrapped loose task", task: true, loose: true, wrapped: true },
    { name: "formatted paragraph", formatted: true },
  ]
  for (const shape of shapes) {
    for (const separator of ["_", "-"]) {
      for (const slashCount of [0, 1, 2, 3]) {
        await t.test(
          `${shape.name}, escaped ${separator}, caret slashes=${slashCount}`,
          async () => {
            const escapedCaret = slashCount % 2 === 1
            const names = ["Lit", escapedCaret ? "Lit" : "Other"]
            let source = names
              .map((name, index) => {
                const label = index === 0 ? "Public example" : "Another example"
                return `${shape.task ? "- [ ] " : ""}${shape.formatted ? `**${label}**` : label} ${"\\".repeat(slashCount)}^${name}\\${separator}eral`
              })
              .join(!shape.task || shape.loose ? "\n\n" : "\n")
            if (shape.wrapped) source = `<div>\n\n${source}\n\n</div>`
            const result = await parse(source)
            if (escapedCaret) {
              assert.deepEqual(Object.keys(result.file.data.blocks!), [])
              assert.equal(result.html.match(new RegExp(`\\^Lit${separator}eral`, "g"))?.length, 2)
            } else {
              assert.deepEqual(Object.keys(result.file.data.blocks!), [
                `Lit${separator}eral`,
                `Other${separator}eral`,
              ])
              assert.equal(
                result.file.data.blocks![`Lit${separator}eral`].tagName,
                shape.task && !shape.loose ? "li" : "p",
              )
            }
          },
        )
      }
    }
  }
})

test("internally escaped source IDs retain strict duplicate failures", async () => {
  for (const separator of ["_", "-"]) {
    for (const task of [false, true]) {
      const prefix = task ? "- [ ] " : ""
      await assert.rejects(
        parse(
          `${prefix}Public example ^Lit\\${separator}eral\n\n${prefix}Another example ^Lit\\${separator}eral`,
        ),
        new RegExp(`Duplicate block reference "Lit${separator}eral"`),
      )
    }
  }
})

test("standalone quote markers decode internal ID escapes without consuming escaped literals", async (t) => {
  for (const separator of ["_", "-"]) {
    for (const slashCount of [0, 1, 2, 3]) {
      await t.test(`escaped ${separator}, caret slashes=${slashCount}`, async () => {
        const escapedCaret = slashCount % 2 === 1
        const names = ["Lit", escapedCaret ? "Lit" : "Other"]
        const source = names
          .map(
            (name) =>
              `> Quoted public text\n\n${"\\".repeat(slashCount)}^${name}\\${separator}eral`,
          )
          .join("\n\n")
        const result = await parse(source)
        if (escapedCaret) {
          assert.deepEqual(Object.keys(result.file.data.blocks!), [])
          assert.equal(result.html.match(new RegExp(`\\^Lit${separator}eral`, "g"))?.length, 2)
        } else {
          assert.deepEqual(Object.keys(result.file.data.blocks!), [
            `Lit${separator}eral`,
            `Other${separator}eral`,
          ])
          assert.equal(
            result.file.data.blocks![`Lit${separator}eral`].tagName,
            slashCount === 0 ? "blockquote" : "p",
          )
        }
      })
    }
  }
})

test("escaped task markers survive GFM/rehypeRaw without registering duplicate IDs", async (t) => {
  for (const loose of [false, true]) {
    for (const wrapped of [false, true]) {
      await t.test(`${loose ? "loose" : "tight"}, raw HTML wrapper=${wrapped}`, async () => {
        let source = [
          String.raw`- [ ] Public example \^Literal`,
          String.raw`- [x] Another example \^Literal`,
          "- [ ] Public target ^MiXeD",
        ].join(loose ? "\n\n" : "\n")
        if (wrapped) source = `<div>\n\n${source}\n\n</div>`
        const result = await parse(`${source}\n\n[[#^MiXeD|jump]]`)
        assert.equal(Object.hasOwn(result.file.data.blocks!, "Literal"), false)
        assert.equal(result.file.data.blocks!.MiXeD.tagName, loose ? "p" : "li")
        assert.equal(result.links[0].properties.href, "#MiXeD")
        assert.equal(result.html.match(/\^Literal/g)?.length, 2)
      })
    }
  }
})

test("unescaped duplicate task IDs still fail strictly", async () => {
  await assert.rejects(
    parse("- [ ] Public example ^Duplicate\n- [ ] Another example ^Duplicate"),
    /Duplicate block reference "Duplicate"/,
  )
})

test("ordinary paragraphs after quotes retain their own IDs and searchable text", async (t) => {
  const paragraphs = [
    "FOLLOWUP_SENTINEL explanation ^Body",
    "FOLLOWUP_SENTINEL **explanation** ^Body",
    "FOLLOWUP_SENTINEL **explanation**^Body",
    "FOLLOWUP_SENTINEL <span>explanation</span>^Body",
    "FOLLOWUP_SENTINEL explanation ^Early**formatted suffix** ^Body",
    "FOLLOWUP_SENTINEL explanation ^Early  \ncontinued suffix ^Body",
    "FOLLOWUP_SENTINEL explanation ^Early<span>formatted suffix</span> ^Body",
    "FOLLOWUP_SENTINEL explanation ^Early<!-- boundary --> suffix ^Body",
  ]
  for (const [index, paragraph] of paragraphs.entries()) {
    await t.test(`paragraph shape ${index}`, async () => {
      const result = await parse(`> Quoted public text\n\n${paragraph}\n\n[[#^Body|jump]]`)
      const doc = extractSearchDocument(result.tree, {
        slug: "opencode",
        title: "Public",
        tags: [],
      })
      const hits = new SearchEngine([doc]).search("FOLLOWUP_SENTINEL")
      assert.equal(hits[0]?.slug, "opencode")
      assert.match(hits[0]?.preview ?? "", /FOLLOWUP_SENTINEL/)
      assert.equal(result.file.data.blocks!.Body.tagName, "p")
      assert.equal(Object.hasOwn(result.file.data.blocks!, "Early"), false)
      assert.equal(result.links[0].properties.href, "#Body")
      const quote = result.tree.children.find(
        (node): node is Element => node.type === "element" && node.tagName === "blockquote",
      )
      assert.equal(quote?.properties.id, undefined)
    })
  }
})

test("only a standalone marker paragraph binds to the preceding quote", async (t) => {
  for (const [name, marker] of [
    ["plain", "^Quote"],
    ["whitespace", "   ^Quote "],
    ["raw HTML whitespace", "<p> \t^Quote \n</p>"],
  ]) {
    await t.test(name, async () => {
      const result = await parse(`> Quoted public text\n\n${marker}\n\n[[#^Quote|jump]]`)
      assert.equal(result.file.data.blocks!.Quote.tagName, "blockquote")
      assert.deepEqual(result.ids, ["Quote"])
      assert.equal(result.links[0].properties.href, "#Quote")
      assert.doesNotMatch(result.html, /\^Quote/)
    })
  }
})

test("escaped or formatted quote marker paragraphs remain literal content", async () => {
  for (const marker of [String.raw`\^Literal`, "**^Literal**", "^Literal  \ncontinued text"]) {
    const result = await parse(`> Quoted public text\n\n${marker}`)
    assert.deepEqual(Object.keys(result.file.data.blocks!), [])
    assert.match(result.html, /\^Literal/)
  }
})

test("HTML embed String.replace guards escaped wikilinks using its original input", async () => {
  const result = await parse(
    String.raw`<div>\[[#^MiXeD|literal]] [[#^MiXeD|valid]]</div>`,
    "opencode",
    true,
  )
  assert.equal(result.links.length, 1)
  assert.equal(result.links[0].properties.href, "#MiXeD")
  assert.match(result.html, /\[\[#\^MiXeD\|literal\]\]/)

  const evenSlashes = await parse(String.raw`<div>\\[[#^MiXeD|valid]]</div>`, "opencode", true)
  assert.equal(evenSlashes.links.length, 1)
  assert.equal(evenSlashes.links[0].properties.href, "#MiXeD")
})

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

test("GFM tasks and raw HTML produce incomplete rehypeRaw positions without breaking blocks", async (t) => {
  for (const loose of [false, true]) {
    for (const wrapped of [false, true]) {
      await t.test(
        `${loose ? "loose" : "tight"} tasks ${wrapped ? "with" : "without"} raw HTML`,
        async () => {
          const tasks = loose
            ? "- [ ] Public task ^Body\n\n- [x] Another public task"
            : "- [ ] Public task ^Body"
          const content = wrapped ? `<div class="synthetic">\n\n${tasks}\n\n</div>` : tasks
          let incompletePositions = 0
          const result = await parse(`${content}\n\n> Public quote\n\n^Quote`, "opencode", false, {
            afterRawHtml(tree) {
              visit(tree, "text", (node) => {
                if (node.position && (!node.position.start || !node.position.end))
                  incompletePositions++
              })
            },
          })
          assert.ok(
            incompletePositions > 0,
            "the real rehypeRaw must produce the incomplete positions",
          )
          if (wrapped) assert.match(result.html, /class="synthetic"/)
          assert.match(result.html, /type="checkbox"/)
          assert.equal(result.file.data.blocks!.Body.tagName, loose ? "p" : "li")
          assert.equal(result.file.data.blocks!.Quote.tagName, "blockquote")
          assert.deepEqual(new Set(result.ids), new Set(["Body", "Quote"]))
        },
      )
    }
  }
})

const positionShapes = {
  absent: undefined,
  empty: {},
  undefinedPoints: { start: undefined, end: undefined },
  startOnly: { start: { line: 1, column: 1, offset: 0 } },
  endOnly: { end: { line: 1, column: 1, offset: 0 } },
  emptyPoints: { start: {}, end: {} },
  missingStartOffset: { start: { line: 1, column: 1 }, end: { line: 1, column: 1, offset: 0 } },
  missingEndOffset: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1 } },
  normal: "keep parsed positions",
} as const

function setTextPositions(tree: MdRoot | Root, shape: keyof typeof positionShapes) {
  if (shape === "normal") return
  visit(tree, "text", (node) => {
    if (shape === "absent") delete node.position
    else node.position = structuredClone(positionShapes[shape]) as typeof node.position
  })
}

test("block references retain fallback parsing for absent or partial text positions", async (t) => {
  for (const shape of Object.keys(positionShapes) as (keyof typeof positionShapes)[]) {
    for (const blockquote of [false, true]) {
      await t.test(`${shape}: ${blockquote ? "blockquote marker" : "inline block"}`, async () => {
        const source = blockquote
          ? "> Public quoted paragraph\n\n^MiXeD\n\n[[#^MiXeD|alias]]"
          : "Public paragraph ^MiXeD\n\n[[#^MiXeD|alias]]"
        const result = await parse(source, "opencode", false, {
          afterRawHtml: (tree) => setTextPositions(tree, shape),
        })
        assert.deepEqual(result.ids, ["MiXeD"])
        assert.equal(result.file.data.blocks!.MiXeD.tagName, blockquote ? "blockquote" : "p")
        assert.equal(result.links[0].properties.href, "#MiXeD")
      })
    }
  }
})

test("wikilink source guards tolerate absent or partial mdast text positions", async (t) => {
  for (const shape of Object.keys(positionShapes) as (keyof typeof positionShapes)[]) {
    await t.test(shape, async () => {
      const result = await parse("[[#^MiXeD|alias]]", "opencode", false, {
        markdown: (tree) => setTextPositions(tree, shape),
      })
      assert.equal(result.links.length, 1)
      assert.equal(result.links[0].properties.href, "#MiXeD")
    })
  }
})

test("complete source offsets still guard escaped inline blocks, blockquotes and wikilinks", async () => {
  const inline = await parse(String.raw`Public paragraph \^MiXeD`)
  assert.deepEqual(inline.ids, [])
  assert.match(inline.html, /\^MiXeD/)
  const quote = await parse("> Public quoted paragraph\n\n" + String.raw`\^MiXeD`)
  assert.deepEqual(quote.ids, [])
  assert.match(quote.html, /\^MiXeD/)
  const link = await parse(String.raw`\[[#^MiXeD|literal]] [[#^MiXeD|valid]]`)
  assert.equal(link.links.length, 1)
  assert.equal(link.links[0].properties.href, "#MiXeD")
  assert.match(link.html, /\[\[#\^MiXeD\|literal\]\]/)
})
