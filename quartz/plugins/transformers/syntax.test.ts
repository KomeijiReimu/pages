import assert from "node:assert/strict"
import test from "node:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { visit } from "unist-util-visit"
import type { Element } from "hast"
import { toHtml } from "hast-util-to-html"
import { VFile } from "vfile"
import type { BuildCtx } from "../../util/ctx"
import { HighlightSidecars } from "../emitters/highlightSidecars"
import { loadMarkdownTestModules } from "./test-utils"

const modules = loadMarkdownTestModules()

async function renderSyntax(source: string, enableSidecars: boolean) {
  const syntax = (await modules).SyntaxHighlighting()
  const plugins: BuildCtx["cfg"]["plugins"] = {
    transformers: [syntax],
    filters: [],
    emitters: enableSidecars ? [HighlightSidecars()] : [],
  }
  const processor = unified().use(remarkParse).use(remarkRehype)
  processor.use(syntax.htmlPlugins!({ cfg: { plugins } } as BuildCtx))
  const file = new VFile(source)
  const tree = await processor.run(processor.parse(file), file)
  return { tree, file }
}

test("lazy syntax output numbers raw source without adding line elements", async () => {
  const { tree, file } = await renderSyntax(
    "```js\na\nb\n```\n\n```js showLineNumbers{0}\na\n\nb\n```\n\n```\nraw\n```",
    true,
  )
  assert.equal(file.data.highlightSidecars, undefined)
  assert.match(toHtml(tree), /<script[^>]*data-komei-code-chunks/)
  const blocks: Element[] = []
  visit(tree, "element", (el) => {
    if (el.tagName === "code") blocks.push(el)
  })
  assert.equal(blocks.length, 3)
  for (const [i, el] of blocks.entries()) {
    const source = [{ type: "text", value: JSON.parse(String(el.properties.dataClipboard)) }]
    if (i === 2) assert.deepEqual(el.children, source)
    else {
      assert.deepEqual(el.children, [
        {
          type: "element",
          tagName: "span",
          properties: { ariaHidden: "true", dataKomeiGutter: ["1\n2", "0\n1\n2"][i] },
          children: [],
        },
        {
          type: "element",
          tagName: "span",
          properties: { dataKomeiChunkBody: "" },
          children: source,
        },
      ])
    }
  }
})

test("oversized syntax data stays inline unless the sidecar emitter is registered", async () => {
  const source = "```js\n" + "const n = f(42, true)\n".repeat(500) + "```"
  const inline = await renderSyntax(source, false)
  assert.equal(inline.file.data.highlightSidecars, undefined)
  assert.match(toHtml(inline.tree), /<script[^>]*data-komei-code-chunks/)

  const external = await renderSyntax(source, true)
  const html = toHtml(external.tree)
  assert.doesNotMatch(html, /<script[^>]*data-komei-code-chunks/)
  const hashes = html.match(/data-komei-code-groups="([a-f0-9 ]+)"/)?.[1].split(" ")
  assert.ok(hashes && hashes.length > 1)
  assert.deepEqual(new Set(hashes), new Set(Object.keys(external.file.data.highlightSidecars!)))
})
