import fs from "node:fs"
import path from "node:path"
import rehypeRaw from "rehype-raw"
import { visit } from "unist-util-visit"

// Usage: node scripts/check-internal-links.mjs [outputDir] [siteOrigin]
// Quartz writes its configured baseUrl into every absolute <loc> in the sitemap.
const publicDir = path.resolve(process.argv[2] ?? "public")

function walk(dir) {
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const filePath = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(filePath) : [filePath]
  })
}

function documentPath(filePath) {
  const relativePath = path
    .relative(publicDir, filePath)
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/")
  if (relativePath === "index.html") return "/"
  if (relativePath.endsWith("/index.html")) {
    return `/${relativePath.slice(0, -"index.html".length)}`
  }

  return `/${relativePath.slice(0, -".html".length)}`
}

function targetCandidates(urlPath) {
  let normalizedPath
  try {
    normalizedPath = decodeURIComponent(urlPath)
  } catch {
    throw new Error(`路径编码无效：${urlPath}`)
  }
  const relativePath = normalizedPath.replace(/^\/+/, "")

  if (relativePath.split("/").includes("..")) throw new Error(`路径超出输出目录：${urlPath}`)
  const file = path.join(publicDir, relativePath)
  if (normalizedPath.endsWith("/")) return [path.join(file, "index.html")]
  if (path.extname(relativePath)) return [file]
  return [file, `${file}.html`, path.join(file, "index.html")]
}

const htmlFiles = walk(publicDir).filter((filePath) => filePath.endsWith(".html"))
const failures = []

if (htmlFiles.length === 0) {
  console.error(`没有找到 ${publicDir} 下的 HTML，请先运行构建再检查内部链接。`)
  process.exit(1)
}

const sitemap = path.join(publicDir, "sitemap.xml")
const location =
  process.argv[3] ??
  (fs.existsSync(sitemap) && fs.readFileSync(sitemap, "utf8").match(/<loc>\s*([^<]+)<\/loc>/)?.[1])
if (!location || !/^https?:\/\//i.test(location)) {
  console.error("无法从 sitemap.xml 获取站点地址；请在输出目录参数后传入站点 origin。")
  process.exit(1)
}
const siteOrigin = new URL(location).origin
const anchors = new Map()
const references = new Map()
for (const file of htmlFiles) {
  const ids = new Set()
  const urls = new Set()
  const html = fs.readFileSync(file, "utf8")
  const tree = rehypeRaw()({ type: "root", children: [{ type: "raw", value: html }] })
  visit(tree, "element", ({ tagName, properties: p }) => {
    if (p.id != null) ids.add(String(p.id))
    if (tagName === "a" && p.name != null) ids.add(String(p.name))
    for (const ref of [p.href, p.src, p.poster]) {
      if (typeof ref === "string" && ref.trim()) urls.add(ref.trim())
    }
  })
  anchors.set(file, ids)
  references.set(file, urls)
}

for (const [file, urls] of references) {
  const sourcePath = documentPath(file)
  const sourceUrl = new URL(sourcePath, siteOrigin)
  for (const rawHref of urls) {
    let url
    try {
      url = new URL(rawHref, sourceUrl)
    } catch {
      failures.push(`${sourcePath} -> ${rawHref} 无法解析`)
      continue
    }

    if (!["http:", "https:"].includes(url.protocol) || url.origin !== siteOrigin) continue

    let candidates
    try {
      candidates = targetCandidates(url.pathname)
    } catch (error) {
      failures.push(`${sourcePath} -> ${rawHref} ${error.message}`)
      continue
    }
    const existingPath = candidates.find((candidate) =>
      fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
    )

    if (!existingPath) {
      failures.push(`${sourcePath} -> ${rawHref} 缺少目标文件 ${url.pathname}`)
      continue
    }

    if (!url.hash || !anchors.has(existingPath)) continue
    let id
    try {
      id = decodeURIComponent(url.hash.slice(1))
    } catch {
      failures.push(`${sourcePath} -> ${rawHref} 锚点编码无效：${url.hash}`)
      continue
    }

    if (id.toLowerCase() !== "top" && !anchors.get(existingPath).has(id)) {
      failures.push(`${sourcePath} -> ${rawHref} 缺少目标锚点 ${url.hash}`)
    }
  }
}

if (failures.length > 0) {
  console.error("发现内部链接问题：")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`已检查 ${htmlFiles.length} 个 HTML 文件，内部链接未发现 404。`)
