// Synthetic public corpus shared by backend tests and their browser harness.
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Element, ElementContent, Root } from "hast"
import { VFile } from "vfile"
import { build } from "esbuild"
import { ContentIndex } from "../../plugins/emitters/contentIndex"
import type { BuildCtx } from "../ctx"
import type { StaticResources } from "../resources"
import type { ProcessedContent } from "../../plugins/vfile"
import type { SearchDocument } from "./protocol"
import { extractSearchDocument } from "./extract"

export const fixtureDirectory = resolve(".quartz-cache/search-backend/public")
export const element = (
  tagName: string,
  children: ElementContent[],
  properties: Element["properties"] = {},
): Element => ({ type: "element", tagName, properties, children })
const text = (value: string): ElementContent => ({ type: "text", value })

export function syntheticTree(): Root {
  const source =
    Array.from({ length: 12000 }, (_, i) => `item${i} data`).join("\n") +
    "\nLASTCODE_12000 C++ [ <img src=x onerror=alert(1)>"
  return {
    type: "root",
    children: [
      element("h1", [text("Public corpus")], { id: "public-corpus" }),
      element("p", [
        text("alpha 中国介绍 " + "ordinary ".repeat(1500)),
        element("span", [text(" ARIAVISIBLE_SENTINEL")], { ariaHidden: "true" }),
      ]),
      element("h2", [text("Tail heading")], { id: "tail:Case[Exact]" }),
      element("p", [text("omega 9111 中文末尾检索证据 & <literal> not &lt;literal&gt;")]),
      element("pre", [
        element("code", [text(source)], { dataKomeiCodePlaceholder: "true" }),
        element("script", [text('{"SHIKISECRET":"<span>tokens</span>"}')], {
          type: "application/json",
          dataKomeiCodeChunks: "true",
        }),
      ]),
      element("script", [text("SCRIPTSECRET")]),
      element("style", [text("STYLESECRET")]),
      element("template", [text("TEMPLATESECRET")]),
    ],
  }
}

export function syntheticDocuments(): SearchDocument[] {
  return [
    extractSearchDocument(syntheticTree(), {
      slug: "public/large",
      title: "<img src=x onerror=alert(1)> Corpus",
      tags: ["testing", "编程"],
    }),
    {
      slug: "public/title",
      title: "9111 priority",
      tags: ["other"],
      text: "small title result",
      paragraphs: [{ start: 0, end: 18 }],
      headings: [],
    },
  ]
}

export async function emitPublicFixture() {
  await mkdir(fixtureDirectory, { recursive: true })
  const tree = syntheticTree()
  const file = new VFile("ignored description")
  file.data = {
    slug: "public/large",
    relativePath: "public/large.md",
    frontmatter: { title: "<img src=x onerror=alert(1)> Corpus", tags: ["testing", "编程"] },
    text: "already &lt;escaped&gt; ".repeat(1000),
    links: [],
  } as unknown as VFile["data"]
  const ctx = {
    argv: { output: fixtureDirectory },
    cfg: { configuration: { defaultDateType: "modified", locale: "en-US" } },
    allSlugs: ["public/large", "UNPUBLISHED_SECRET"],
  } as unknown as BuildCtx
  const emitted: string[] = []
  const start = performance.now()
  for await (const path of await ContentIndex({ enableRSS: false, enableSiteMap: false }).emit(
    ctx,
    [[tree, file]] as ProcessedContent[],
    {} as StaticResources,
  ))
    emitted.push(path)
  const buildMs = performance.now() - start
  const client = await build({
    stdin: {
      contents: `import {searchDocuments,resetSearchClient} from "./searchClient";
    globalThis.backendSearch=searchDocuments;globalThis.backendReset=resetSearchClient;`,
      resolveDir: resolve("quartz/components/scripts"),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    metafile: true,
    target: "es2022",
  })
  await writeFile(resolve(fixtureDirectory, "backend-client.js"), client.outputFiles[0].contents)
  await writeFile(
    resolve(fixtureDirectory, "index.html"),
    '<!doctype html><meta charset="utf-8"><title>Public backend fixture</title><script src="/backend-client.js"></script>',
  )
  return { emitted, buildMs, clientInputs: Object.keys(client.metafile!.inputs) }
}
