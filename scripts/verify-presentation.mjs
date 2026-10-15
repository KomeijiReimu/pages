import fs from "node:fs"
import path from "node:path"

// Generated-HTML smoke checks, not a browser/CSS or audio-decoding test.
// Usage: node scripts/verify-presentation.mjs [outputDir]
// Alternate logo names: PRESENTATION_LOGO_PATTERN='satori|eye' node scripts/verify-presentation.mjs
const outputDir = path.resolve(process.argv[2] ?? "public")
const origin = "https://presentation.invalid"
const failures = []
let checks = 0

function check(condition, message) {
  checks++
  if (!condition) failures.push(message)
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    // Bundled games and static demos are not production Quartz documents.
    if (entry.isDirectory()) return entry.name === "static" ? [] : walk(file)
    return entry.name.endsWith(".html") ? [file] : []
  })
}

function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" }
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
    const number = entity.slice(2, -1)
    const code = number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : +number
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })
}

function attr(tag, name) {
  const match = tag.match(
    new RegExp(`\\s${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=\\s|/?>)`, "i"),
  )
  return match ? decode(match[1] ?? match[2] ?? match[3] ?? "") : undefined
}

function hasClass(tag, name) {
  return (attr(tag, "class") ?? "").split(/\s+/).includes(name)
}

// Quartz emits quoted attributes and non-nested nav/anchor/section blocks.
function blocks(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"))].map(
    (m) => m[0],
  )
}

function tags(html, tag) {
  return html.match(new RegExp(`<${tag}\\b[^>]*>`, "gi")) ?? []
}

function markup(html) {
  return html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
}

function text(html) {
  return decode(markup(html).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim()
}

function urlFor(file) {
  return new URL(path.relative(outputDir, file).split(path.sep).join("/"), `${origin}/`)
}

function localFile(href, file) {
  try {
    const url = new URL(href, urlFor(file))
    if (url.origin !== origin) return undefined
    const target = path.resolve(outputDir, `.${decodeURIComponent(url.pathname)}`)
    if (target !== outputDir && !target.startsWith(`${outputDir}${path.sep}`)) return undefined
    return [target, path.join(target, "index.html"), `${target}.html`].find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    )
  } catch {
    return undefined
  }
}

function validLinks(section, className, home, label, hasContent = true) {
  const links = blocks(section, "a").filter((a) => hasClass(a, className))
  if (!hasContent && links.length === 0) {
    console.log(`SKIP：${label}没有可发布内容，保留模块存在断言，跳过内容链接断言。`)
    return
  }
  check(links.length > 0, `${label}：缺少真实内容入口`)
  for (const link of links) {
    const href = attr(link, "href")
    check(href && !href.startsWith("#") && localFile(href, home), `${label}：失效入口 ${href}`)
  }
}

const pages = walk(outputDir)
  .map((file) => ({ file, html: fs.readFileSync(file, "utf8") }))
  .filter(({ html }) => tags(html, "body").some((tag) => attr(tag, "data-slug") !== undefined))
const home = pages.find(({ file }) => file === path.join(outputDir, "index.html"))
check(Boolean(home), `${outputDir}：缺少生成的首页，请先构建`)

// Only generated artifacts determine availability; do not read private source notes.
const slugOf = (html) => attr(tags(html, "body")[0] ?? "", "data-slug") ?? ""
const indexFile = path.join(outputDir, "static", "contentIndex.json")
const contentIndex = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {}
const publishedSlugs = new Set([
  ...Object.keys(contentIndex),
  ...pages.map(({ html }) => slugOf(html)),
])
const isContentSlug = (slug) =>
  slug !== "index" &&
  slug !== "404" &&
  !slug.endsWith("/index") &&
  !/^(?:tags|categories)(?:\/|$)/.test(slug)
const contentSlugs = [...publishedSlugs].filter(isContentSlug)
const hasPosts = contentSlugs.some((slug) => /^(?:notes|posts)\//.test(slug))
const hasCategories = contentSlugs.some((slug) => /^notes\/[^/]+\//.test(slug))
const hasTags =
  contentSlugs.some((slug) => contentIndex[slug]?.tags?.length > 0) ||
  [...publishedSlugs].some((slug) => slug.startsWith("tags/") && slug !== "tags/index")

const expectedNav = ["首页", "归档", "文章", "标签", "关于"]
const expectedPaths = ["/", "/categories/", "/posts/", "/tags/", "/about/"]
const forbidden = ["公开内容节选", "本独立小样", "设计预览"]
const presentationSlugs = new Set([
  "index",
  "categories/index",
  "posts/index",
  "posts/all/index",
  "tags/index",
  "about/index",
  "404",
])
const ordinaryPages = []
for (const { file, html } of pages) {
  const name = path.relative(outputDir, file)
  const clean = markup(html)
  const navs = blocks(clean, "nav").filter((nav) => hasClass(nav, "komei-top-nav"))
  const links = blocks(navs[0] ?? "", "a")
  check(
    navs.length === 1 && JSON.stringify(links.map(text)) === JSON.stringify(expectedNav),
    `${name}：主导航顺序应为 ${expectedNav.join("→")}`,
  )
  check(
    links.length === expectedPaths.length &&
      links.every((link, i) => {
        try {
          const url = new URL(attr(link, "href"), urlFor(file))
          return (
            url.origin === origin &&
            url.pathname === expectedPaths[i] &&
            Boolean(localFile(attr(link, "href"), file))
          )
        } catch {
          return false
        }
      }),
    `${name}：主导航目标缺失或不正确`,
  )
  check(!/sourceMappingURL\s*=\s*data:/i.test(html), `${name}：含内联 sourceMappingURL=data`)
  // Do not restrict vocabulary in ordinary notes, including private published notes.
  if (presentationSlugs.has(slugOf(clean))) {
    for (const phrase of forbidden)
      check(!text(clean).includes(phrase), `${name}：残留文案「${phrase}」`)
  }

  if (
    tags(clean, "h1").some((tag) => hasClass(tag, "article-title")) &&
    /^(?:notes|posts)\//.test(attr(tags(clean, "body")[0] ?? "", "data-slug") ?? "") &&
    !(attr(tags(clean, "body")[0], "data-slug") ?? "").endsWith("/index")
  ) {
    ordinaryPages.push({ file, html })
  }
}

if (home) {
  const clean = markup(home.html)
  for (const phrase of ["Obsidian 风格的笔记、博客与灵感。", "设计、技术与思考"])
    check(!text(clean).includes(phrase), `首页：残留已删除的标语「${phrase}」`)
  for (const phrase of [
    "主要是因为主页太空了。",
    "没想好这里要放啥。",
    "为了减少资源量，这里存放的都是128k的渣音质。",
  ])
    check(text(clean).includes(phrase), `首页：缺少用户原话「${phrase}」`)
  const sections = blocks(clean, "section")
  const section = (name) => sections.find((s) => hasClass(s, name)) ?? ""
  for (const name of [
    "komei-home-hero",
    "komei-post-cards",
    "komei-category-overview",
    "komei-tag-cloud-section",
    "komei-home-modules",
    "komei-home-gallery",
  ])
    check(Boolean(section(name)), `首页：缺少真实模块 ${name}`)
  check(text(section("komei-home-hero")).includes("相信的心就是你的魔法"), "首页：Hero 主句缺失")
  validLinks(section("komei-home-hero"), "komei-button", home.file, "Hero")
  validLinks(
    blocks(section("komei-post-cards"), "h3").join(""),
    "internal",
    home.file,
    "文章流",
    hasPosts,
  )
  validLinks(
    section("komei-category-overview"),
    "komei-category-card",
    home.file,
    "归档",
    hasCategories,
  )
  validLinks(section("komei-tag-cloud-section"), "komei-tag-pill", home.file, "标签", hasTags)

  const music = section("komei-home-modules")
  check(
    tags(music, "audio").some((tag) => attr(tag, "data-komei-music-audio") !== undefined),
    "首页：音乐播放器缺失",
  )
  check(
    tags(music, "button").some(
      (tag) =>
        attr(tag, "data-komei-music-play") !== undefined &&
        attr(tag, "aria-disabled") === "false" &&
        attr(tag, "disabled") === undefined,
    ),
    "首页：当前音乐播放入口不可用",
  )
  const tracks = tags(music, "button").filter(
    (tag) =>
      attr(tag, "data-komei-music-track") !== undefined &&
      ["local", "network"].includes(attr(tag, "data-source-kind")) &&
      attr(tag, "data-src"),
  )
  check(tracks.length > 0, "首页：没有已配置的可播放曲目")
  for (const track of tracks) {
    const src = attr(track, "data-src")
    check(attr(track, "aria-disabled") === "false", `音乐：配置曲目不可播放 ${src}`)
    check(
      attr(track, "data-source-kind") === "local"
        ? Boolean(localFile(src, home.file))
        : /^https?:\/\//.test(src),
      `音乐：音源无效或本地文件不存在 ${src}`,
    )
  }
  const photos = tags(section("komei-home-gallery"), "img").filter((tag) =>
    attr(tag, "data-komei-gallery-src"),
  )
  check(photos.length > 0, "首页：相册没有真实照片入口")
  for (const photo of photos) {
    const src = attr(photo, "data-komei-gallery-src")
    check(Boolean(localFile(src, home.file)), `相册：原图不存在 ${src}`)
  }

  const brand = blocks(clean, "a").find((a) => hasClass(a, "komei-site-header__brand")) ?? ""
  const logoPattern = new RegExp(process.env.PRESENTATION_LOGO_PATTERN ?? "heartline|觉之瞳", "i")
  const logos = [
    ...new Set(
      tags(brand, "img")
        .map((tag) => attr(tag, "src"))
        .filter((src) => src && logoPattern.test(decodeURIComponent(src))),
    ),
  ]
  check(
    logos.length >= 2,
    "Logo：未引用明暗两份觉之瞳 SVG（默认资源名匹配 heartline|觉之瞳，可用 PRESENTATION_LOGO_PATTERN 覆盖）",
  )
  for (const src of logos) {
    const file = localFile(src, home.file)
    check(
      file &&
        path.extname(file).toLowerCase() === ".svg" &&
        /<svg\b/i.test(fs.readFileSync(file, "utf8")),
      `Logo：引用不是存在的本地 SVG ${src}`,
    )
  }
}

// Static load checks: a gated lazy loader mentioning GSAP is not itself GSAP core.
// Runtime network behaviour after SPA navigation remains a browser-test responsibility.
const examinedScripts = new Set()
for (const { file, html } of ordinaryPages) {
  for (const link of tags(html, "link")) {
    if (!["preload", "modulepreload"].includes(attr(link, "rel"))) continue
    const href = attr(link, "href")
    check(
      !href || !/\bgsap(?:[.\-/]|$)/i.test(new URL(href, urlFor(file)).pathname),
      `${path.relative(outputDir, file)}：普通文章预加载 GSAP`,
    )
  }
  for (const script of blocks(html, "script")) {
    const src = attr(script, "src")
    const label = `${path.relative(outputDir, file)}：${src ?? "内联脚本"}`
    check(
      !src || !/\bgsap(?:[.\-/]|$)/i.test(new URL(src, urlFor(file)).pathname),
      `${label}：普通文章直接加载 GSAP`,
    )
    const scriptFile = src && localFile(src, file)
    if (scriptFile && examinedScripts.has(scriptFile)) continue
    if (scriptFile) examinedScripts.add(scriptFile)
    const code = scriptFile ? fs.readFileSync(scriptFile, "utf8") : src ? "" : script
    check(
      !/GSAP\s+3\.\d|greensock\.com|gsap-license/i.test(code),
      `${label}：普通文章脚本内嵌 GSAP 核心`,
    )
  }
}
if (ordinaryPages.length === 0) console.log("SKIP：生成产物中没有普通文章，未检查文章 GSAP 加载。")
console.log(
  `已检查 ${pages.length} 个生产 HTML、${ordinaryPages.length} 篇普通文章，共 ${checks} 项断言。`,
)
if (failures.length) {
  for (const message of failures.slice(0, 30)) console.error(`FAIL：${message}`)
  if (failures.length > 30) console.error(`另有 ${failures.length - 30} 项失败。`)
  process.exitCode = 1
} else {
  console.log("PASS：生产展示产物检查通过。")
}
