import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"
import { createElement } from "preact"
import { renderToString } from "preact-render-to-string"
import type { QuartzComponent, QuartzComponentProps } from "./types"
import type { FilePath, FullSlug } from "../util/path"

// Exercise the actual SSR components; no CLI cache, browser or private content required.
const bundle = await build({
  stdin: {
    contents: `export { default as Categories } from "./CategoryOverview"
      export { default as Breadcrumbs } from "./Breadcrumbs"
      export { default as TopNav } from "./TopNav"`,
    resolveDir: import.meta.dirname,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  loader: { ".scss": "text" },
  plugins: [
    {
      name: "ssr-fixtures",
      setup(builder) {
        builder.onLoad({ filter: /\.inline\.ts$/ }, () => ({ contents: 'export default ""' }))
        builder.onResolve({ filter: /^[^./]/ }, ({ path }) => ({
          path: import.meta.resolve(path),
          external: true,
        }))
      },
    },
  ],
})
const { Categories, Breadcrumbs, TopNav } = (await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
)) as {
  Categories: typeof import("./CategoryOverview").default
  Breadcrumbs: typeof import("./Breadcrumbs").default
  TopNav: typeof import("./TopNav").default
}

const allFiles = [
  ["index", "首页"],
  ["categories/index", "专题"],
  ["notes/projects/index", "目录 & 专题-A"],
  ["notes/projects/main", "独立主笔记"],
  ["notes/projects/deep/page", "深层笔记"],
  ["notes/notes/page", "普通笔记"],
  ["notes/notes/sub/main", "仅子目录有家族"],
].map(([slug, title]) => ({
  slug: slug as FullSlug,
  filePath: `${slug}.md` as FilePath,
  frontmatter: { title, tags: [] },
}))
const ctx = {
  documentFamilies: new Map(
    ["notes/projects", "notes/notes/sub"].map((folder) => [
      folder,
      { mainSlug: `${folder}/main` as FullSlug, mainTitle: "独立主笔记", description: "测试" },
    ]),
  ),
} as QuartzComponentProps["ctx"]

function render(component: QuartzComponent, slug: string) {
  const fileData = allFiles.find((file) => file.slug === slug)!
  return renderToString(
    createElement(component, {
      allFiles,
      ctx,
      fileData,
      cfg: {} as QuartzComponentProps["cfg"],
      children: [],
      tree: { type: "root" },
      externalResources: { css: [], js: [], additionalHead: [] },
    }),
  )
}

function links(html: string, slug: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, body]) => ({
    path: new URL(attrs.match(/\bhref="([^"]*)"/)?.[1] ?? "", `https://blog.example/${slug}.html`)
      .pathname,
    text: body.replace(/<[^>]+>/g, ""),
    attrs,
  }))
}

for (const variant of ["cards", "directory"] as const) {
  test(`${variant}: only links to family directories use their actual title and badge`, () => {
    const slug = variant === "cards" ? "index" : "categories/index"
    const html = render(Categories({ variant }), slug)
    assert.match(html, /id="komei-categories-title"[^>]*>专题</)
    assert.match(html, /aria-label="专题摘要"/)
    const cards = links(html, slug)
    assert.equal(cards.length, 2)
    assert.match(
      cards.find((c) => c.path === "/notes/projects/")!.text,
      /目录 &amp; 专题-A.*笔记家族 · 2 篇/,
    )
    const ordinary = cards.find((c) => c.path === "/notes/notes/")!.text
    assert.match(ordinary, /笔记.*2 篇/)
    assert.doesNotMatch(ordinary, /笔记家族/)
    assert.doesNotMatch(html, /独立主笔记/)
  })
}

test("only ancestor links to published families are marked, even on deep articles", () => {
  const component = Breadcrumbs({ rootName: "首页" })
  for (const [slug, expected] of [
    ["notes/projects/main", "/notes/projects/"],
    ["notes/projects/deep/page", "/notes/projects/"],
    ["notes/notes/sub/main", "/notes/notes/sub/"],
    ["notes/notes/page", ""],
    ["notes/projects/index", ""],
  ]) {
    const crumbs = links(render(component, slug), slug)
    const marked = crumbs.filter((c) => c.text.includes("笔记家族"))
    assert.deepEqual(
      marked.map((c) => c.path),
      expected ? [expected] : [],
    )
    assert.equal(crumbs.find((c) => c.path === "/notes/")?.text, "专题")
    assert.doesNotMatch(crumbs.at(-1)!.text, /笔记家族/)
  }
})

test("top navigation keeps the routes and order, with the topic tooltip on its actual link", () => {
  const slug = "notes/projects/deep/page"
  const nav = links(render(TopNav(), slug).split('class="komei-top-nav__links"')[1], slug)
  assert.deepEqual(
    nav.map((n) => [n.text, n.path]),
    [
      ["首页", "/"],
      ["专题", "/categories/"],
      ["文章", "/posts/"],
      ["标签", "/tags/"],
      ["关于", "/about/"],
    ],
  )
  assert.match(nav[1].attrs, /title="按主题阅读笔记"/)
})
