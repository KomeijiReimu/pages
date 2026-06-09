import fs from "node:fs"
import path from "node:path"

const publicDir = path.resolve("public")
const siteOrigin = "https://komeijireimu.local"
const ignoredProtocols = new Set(["mailto:", "tel:", "javascript:", "data:"])

function walk(dir) {
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const filePath = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(filePath) : [filePath]
  })
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function documentPath(filePath) {
  const relativePath = path.relative(publicDir, filePath).split(path.sep).join("/")
  if (relativePath === "index.html") return "/"
  if (relativePath.endsWith("/index.html")) {
    return `/${relativePath.slice(0, -"index.html".length)}`
  }

  return `/${relativePath}`
}

function targetCandidates(urlPath) {
  let normalizedPath
  try {
    normalizedPath = decodeURIComponent(urlPath)
  } catch {
    throw new Error(`路径编码无效：${urlPath}`)
  }
  const relativePath = normalizedPath.replace(/^\/+/, "")

  if (normalizedPath === "/") return [path.join(publicDir, "index.html")]
  if (normalizedPath.endsWith("/")) return [path.join(publicDir, relativePath, "index.html")]
  if (path.extname(relativePath)) return [path.join(publicDir, relativePath)]

  return [
    path.join(publicDir, relativePath, "index.html"),
    path.join(publicDir, `${relativePath}.html`),
  ]
}

function anchorExists(filePath, hash) {
  if (!hash || !filePath.endsWith(".html") || !fs.existsSync(filePath)) return true

  let id
  try {
    id = decodeURIComponent(hash.slice(1))
  } catch {
    throw new Error(`锚点编码无效：${hash}`)
  }
  const html = fs.readFileSync(filePath, "utf8")
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\s(?:id|name)=["']${escapedId}["']`).test(html)
}

const htmlFiles = walk(publicDir).filter((filePath) => filePath.endsWith(".html"))
const failures = []

if (htmlFiles.length === 0) {
  console.error("没有找到 public/*.html，请先运行构建再检查内部链接。")
  process.exit(1)
}

for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, "utf8")
  const sourcePath = documentPath(filePath)
  const sourceUrl = `${siteOrigin}${sourcePath}`

  for (const match of html.matchAll(/<a\b[^>]*\shref=(['"])(.*?)\1/gi)) {
    const rawHref = decodeHtmlAttribute(match[2].trim())
    if (!rawHref || rawHref.startsWith("#")) continue

    let url
    try {
      url = new URL(rawHref, sourceUrl)
    } catch {
      failures.push(`${sourcePath} -> ${rawHref} 无法解析`)
      continue
    }

    if (ignoredProtocols.has(url.protocol) || url.origin !== siteOrigin) continue

    let candidates
    try {
      candidates = targetCandidates(url.pathname)
    } catch (error) {
      failures.push(`${sourcePath} -> ${rawHref} ${error.message}`)
      continue
    }
    const existingPath = candidates.find((candidate) => fs.existsSync(candidate))

    if (!existingPath) {
      failures.push(`${sourcePath} -> ${rawHref} 缺少目标页面 ${url.pathname}`)
      continue
    }

    let hasAnchor
    try {
      hasAnchor = anchorExists(existingPath, url.hash)
    } catch (error) {
      failures.push(`${sourcePath} -> ${rawHref} ${error.message}`)
      continue
    }

    if (!hasAnchor) {
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
