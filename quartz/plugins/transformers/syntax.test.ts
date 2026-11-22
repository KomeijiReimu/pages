import assert from "node:assert/strict"
import test from "node:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { visit } from "unist-util-visit"
import type { Element } from "hast"
import type { BuildCtx } from "../../util/ctx"
import { loadMarkdownTestModules } from "./test-utils"

test("lazy syntax output numbers raw source without adding line elements", async () => {
  const { SyntaxHighlighting } = await loadMarkdownTestModules()
  const processor = unified().use(remarkParse).use(remarkRehype)
  processor.use(SyntaxHighlighting().htmlPlugins!({} as BuildCtx))
  const tree = await processor.run(
    processor.parse("```js\na\nb\n```\n\n```js showLineNumbers{0}\na\n\nb\n```\n\n```\nraw\n```"),
  )
  const blocks: Element[] = []
  visit(tree, "element", (el) => {
    if (el.tagName === "code") blocks.push(el)
  })
  assert.deepEqual(
    blocks.map((el) => el.properties.dataKomeiGutter),
    ["1\n2", "0\n1\n2", undefined],
  )
  for (const el of blocks) {
    assert.deepEqual(el.children, [
      { type: "text", value: JSON.parse(String(el.properties.dataClipboard)) },
    ])
  }
})
