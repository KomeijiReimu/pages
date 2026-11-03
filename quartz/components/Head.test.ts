import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { build } from "esbuild"
import matter from "gray-matter"
import { createElement } from "preact"
import { renderToString } from "preact-render-to-string"
import type { GlobalConfiguration } from "../cfg"
import { i18n } from "../i18n"
import { defaultProcessedContent } from "../plugins/vfile"
import type { ImageOptions } from "../util/og"
import type { FilePath, FullSlug } from "../util/path"
import type { QuartzComponentConstructor, QuartzComponentProps } from "./types"

// Render the actual Head, keeping the compiled test bundle entirely in memory.
const bundle = await build({
  stdin: {
    contents:
      'export { default } from "./Head"; export { CustomOgImages } from "../plugins/emitters/ogImage"',
    resolveDir: import.meta.dirname,
    loader: "ts",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "preact",
  plugins: [
    {
      name: "head-test-resources",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }))
        builder.onLoad({ filter: /\.inline\.ts$/ }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }))
      },
    },
  ],
})
const { default: HeadConstructor, CustomOgImages } = (await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
)) as {
  default: QuartzComponentConstructor
  CustomOgImages: typeof import("../plugins/emitters/ogImage").CustomOgImages
}
const Head = HeadConstructor(undefined)
const configSource = await readFile(new URL("../../quartz.config.ts", import.meta.url), "utf8")
const pageTitleSuffix = configSource.match(/pageTitleSuffix:\s*"([^"]*)"/)?.[1]
const cfg: GlobalConfiguration = {
  pageTitle: "KomeijiReimu的博客",
  pageTitleSuffix,
  enableSPA: true,
  enablePopovers: true,
  analytics: null,
  locale: "zh-CN",
  baseUrl: "blog.example.com",
  ignorePatterns: [],
  defaultDateType: "modified",
  theme: {
    fontOrigin: "local",
    cdnCaching: false,
    typography: { header: "Header", body: "Body", code: "Code" },
    colors: {
      lightMode: {
        light: "#fff",
        lightgray: "#eee",
        gray: "#aaa",
        darkgray: "#555",
        dark: "#000",
        secondary: "#123",
        tertiary: "#456",
        highlight: "#789",
        textHighlight: "#abc",
      },
      darkMode: {
        light: "#000",
        lightgray: "#555",
        gray: "#aaa",
        darkgray: "#eee",
        dark: "#fff",
        secondary: "#123",
        tertiary: "#456",
        highlight: "#789",
        textHighlight: "#abc",
      },
    },
  },
}

function renderHead(
  slug: string,
  fileData: Partial<QuartzComponentProps["fileData"]> = {},
  configuration: Partial<GlobalConfiguration> = {},
  customOgImages = false,
) {
  const configurationWithDefaults = { ...cfg, ...configuration }
  const emitters = customOgImages ? [CustomOgImages()] : []
  const props = {
    cfg: configurationWithDefaults,
    ctx: { cfg: { configuration: configurationWithDefaults, plugins: { emitters } } },
    fileData: {
      slug: slug as FullSlug,
      frontmatter: { title: "测试页面", tags: [] },
      ...fileData,
    },
    externalResources: { css: [], js: [], additionalHead: [] },
    children: [],
    tree: { type: "root", children: [] },
    allFiles: [],
  } as unknown as QuartzComponentProps
  if (customOgImages) {
    Object.assign(props.externalResources, emitters[0].externalResources!(props.ctx))
  }
  return renderToString(createElement(Head, props))
}

function meta(html: string, key: string) {
  const tag = Array.from(html.matchAll(/<meta\b[^>]*>/g), ([match]) => match).find(
    (tag) => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`),
  )
  return tag?.match(/content="([^"]*)"/)?.[1]
}

for (const [slug, path] of [
  ["index", "/"],
  ["home/index", "/home/"],
  ["about/index", "/about/"],
  ["文章/中文标题", "/%E6%96%87%E7%AB%A0/%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98"],
  ["English/space + plus", "/English/space%20+%20plus"],
  ["%E4%B8%AD%E6%96%87/space%20+%20plus", "/%E4%B8%AD%E6%96%87/space%20+%20plus"],
]) {
  for (const baseUrl of [
    "blog.example.com",
    "blog.example.com/garden",
    "blog.example.com/garden/",
  ]) {
    test(`canonical and social URLs: ${baseUrl}, ${slug}`, () => {
      const html = renderHead(slug, {}, { baseUrl })
      const expected = `https://${baseUrl.replace(/\/$/, "")}${path}`
      assert.equal(html.match(/<link rel="canonical" href="([^"]*)"/)?.[1], expected)
      assert.equal(meta(html, "og:url"), expected)
      assert.equal(meta(html, "twitter:url"), expected)
      assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1)
    })
  }
}

test("404 does not canonicalize or advertise social URLs to the homepage", () => {
  const html = renderHead("404")
  assert.doesNotMatch(html, /rel="canonical"/)
  assert.equal(meta(html, "og:url"), undefined)
  assert.equal(meta(html, "twitter:url"), undefined)
})

test("no canonical is emitted without a configured baseUrl", () => {
  const html = renderHead("index", {}, { baseUrl: undefined })
  assert.doesNotMatch(html, /rel="canonical"/)
  assert.equal(meta(html, "og:url"), undefined)
  assert.equal(meta(html, "twitter:url"), undefined)
})

for (const [socialDescription, description, generated, expected] of [
  [" 社交摘要 ", "页面摘要", "生成摘要", "社交摘要"],
  ["", " 页面摘要 ", "生成摘要", "页面摘要"],
  [" \n\t", " 页面摘要 ", "生成摘要", "页面摘要"],
  [" \n\t", " \n\t", " 生成摘要 ", "生成摘要"],
  [undefined, undefined, "生成 &amp; 摘要", "生成 &amp; 摘要"],
  ["", "", "", i18n(cfg.locale).propertyDefaults.description],
  [" \t", " \n", " \t", i18n(cfg.locale).propertyDefaults.description],
  [undefined, undefined, undefined, i18n(cfg.locale).propertyDefaults.description],
]) {
  test(`description priority: ${JSON.stringify([socialDescription, description, generated])}`, () => {
    const html = renderHead("categories/index", {
      frontmatter: { title: "分类", tags: [], socialDescription, description },
      description: generated,
    })
    assert.ok(expected!.trim())
    for (const key of ["description", "og:description", "twitter:description", "og:image:alt"]) {
      assert.equal(meta(html, key), expected)
    }
  })
}

test("the actual categories navigation has a meaningful description", async () => {
  const { data } = matter(
    await readFile(new URL("../../content/categories/index.md", import.meta.url), "utf8"),
  )
  assert.ok(data.description.trim().length > 20)
  assert.match(data.description, /分类/)
  const html = renderHead("categories/index", {
    frontmatter: { title: data.title, tags: [], description: data.description },
    description: "",
  })
  assert.equal(meta(html, "description"), data.description)
})

test("configured suffix brands HTML and social titles without changing the source title", () => {
  assert.equal(pageTitleSuffix, " | KomeijiReimu")
  const frontmatter = { title: "不动的大图书馆", tags: [] }
  const html = renderHead("index", { frontmatter })
  const title = "不动的大图书馆 | KomeijiReimu"
  assert.ok(html.includes(`<title>${title}</title>`))
  assert.equal(meta(html, "og:title"), title)
  assert.equal(meta(html, "twitter:title"), title)
  assert.equal(frontmatter.title, "不动的大图书馆")
})

test("Open Graph site name uses property and default PNG has a valid MIME type", () => {
  const html = renderHead("index")
  assert.ok(html.includes('<meta property="og:site_name" content="KomeijiReimu的博客"'))
  assert.doesNotMatch(html, /name="og:site_name"/)
  assert.equal(meta(html, "og:image:type"), "image/png")
  assert.equal(meta(html, "og:image"), meta(html, "og:image:url"))
  assert.equal(meta(html, "og:image"), meta(html, "twitter:image"))
})

for (const [filePath, socialImage, imagePath, mime] of [
  ["article.md", undefined, "/article-og-image.webp", "image/webp"],
  [undefined, undefined, "/static/og-image.png", "image/png"],
  ["article.md", "cover.jpg", "/static/cover.jpg", "image/jpeg"],
  ["article.md", "cover.jpeg", "/static/cover.jpeg", "image/jpeg"],
  [
    "article.md",
    "https://images.example.com/cover.JPG",
    "https://images.example.com/cover.JPG",
    "image/jpeg",
  ],
]) {
  test(`enabled CustomOgImages renders real external image metadata: ${imagePath}`, (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => {
      throw new Error("External resource rendering must not fetch fonts")
    })
    const html = renderHead(
      "article",
      {
        filePath: filePath as FilePath | undefined,
        frontmatter: { title: "文章", tags: [], socialImage },
      },
      {},
      true,
    )
    const expected = imagePath!.startsWith("https://")
      ? imagePath
      : `https://blog.example.com${imagePath}`
    assert.equal(meta(html, "og:image:type"), mime)
    for (const key of ["og:image", "og:image:url", "twitter:image"]) {
      assert.equal(meta(html, key), expected)
    }
    assert.equal((html.match(/property="og:image:type"/g) ?? []).length, 1)
    assert.equal(meta(html, "og:site_name"), "KomeijiReimu的博客")
    assert.equal(fetch.mock.callCount(), 0)
  })
}

for (const [socialDescription, description, generated, expected] of [
  [" 社交摘要 ", "页面摘要", "生成摘要", "社交摘要"],
  ["", " 页面摘要 ", "生成摘要", "页面摘要"],
  [" \t", " 页面摘要 ", "生成摘要", "页面摘要"],
  [" \t", " \n", " 生成摘要 ", "生成摘要"],
  [undefined, undefined, "生成 &amp; 摘要", "生成 & 摘要"],
  ["", "", "", i18n(cfg.locale).propertyDefaults.description],
  [" \t", " \n", " \t", i18n(cfg.locale).propertyDefaults.description],
  [undefined, undefined, undefined, i18n(cfg.locale).propertyDefaults.description],
]) {
  test(`CustomOgImages image description priority: ${JSON.stringify([socialDescription, description, generated])}`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => {
      throw new Error("Description tests must not fetch fonts")
    })
    const stopBeforeImageRendering = new Error("Captured image input; do not render or write")
    let captured: ImageOptions | undefined
    const emitter = CustomOgImages({
      imageStructure(options) {
        captured = options
        throw stopBeforeImageRendering
      },
    })
    // Empty font weights require no network; capture the actual processOgImage input
    // before Satori/Sharp rendering and filesystem output, not a copied expression.
    const configuration = {
      ...cfg,
      theme: {
        ...cfg.theme,
        typography: {
          ...cfg.theme.typography,
          header: { name: "Header", weights: [] },
          body: { name: "Body", weights: [] },
        },
      },
    }
    const ctx = {
      cfg: { configuration, plugins: { emitters: [emitter] } },
    } as unknown as QuartzComponentProps["ctx"]
    const result = emitter.emit(
      ctx,
      [
        defaultProcessedContent({
          slug: "article" as FullSlug,
          frontmatter: { title: "文章", tags: [], socialDescription, description },
          description: generated,
        }),
      ],
      { css: [], js: [], additionalHead: [] },
    )
    assert.ok("next" in result)
    await assert.rejects(result.next(), (error) => error === stopBeforeImageRendering)
    assert.ok(captured)
    assert.equal(captured.description, expected)
    assert.equal(captured.title, "文章 | KomeijiReimu")
    assert.equal(fetch.mock.callCount(), 0)
  })
}
