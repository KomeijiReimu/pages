import { constants } from "node:fs"
import { copyFile, lstat, mkdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { remark } from "remark"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { SKIP, visit } from "unist-util-visit"

const [vault, changelog] = process.argv.slice(2)
if (!vault || !changelog) throw new Error("Usage: sync-changelog-images.mjs VAULT CHANGELOG_DIR")

const source = path.join(await realpath(vault), "attachments")
const destination = path.join(await realpath(changelog), "attachments")
const log = path.join(changelog, "index.md")
// Quartz's OFM transformer removes Obsidian comments before remark parses the document.
const markdown = (await readFile(log, "utf8")).trim().replace(/%%[\s\S]*?%%/g, "")
const tree = remark()
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkGfm)
  .use(remarkMath)
  .parse(markdown)
const images = new Set()

function collect(target) {
  target = target.replace(/^\.\//, "")
  if (target.startsWith("attachments/")) target = target.slice("attachments/".length)
  else if (target.includes("/")) return // Only bare names fall back to the root attachment folder.

  if (
    !/\.(?:png|jpe?g|gif|bmp|svg|webp)$/i.test(target) ||
    /[\\:\x00-\x1f]/.test(target) ||
    target.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    return
  }
  images.add(target)
}

function collectMarkdownImage(node) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(node.url)) return
  try {
    collect(decodeURI(node.url.split(/[?#]/, 1)[0]))
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    console.warn(`Warning: ${log}: invalid percent encoding in image URL: ${node.url}`)
  }
}

visit(tree, (node) => {
  if (node.type === "footnoteDefinition") return SKIP
  if (node.type === "link" || node.type === "linkReference") {
    visit(node, "image", collectMarkdownImage)
    return SKIP
  }
  if (node.type === "image") collectMarkdownImage(node)
  if (node.type === "text") {
    // Use original spelling so a Markdown escape or entity cannot introduce an embed.
    const raw = markdown.slice(node.position.start.offset, node.position.end.offset)
    const embed = /(?<!\\)(?:\\\\)*!\[\[([^\[\]|#\\\r\n]+)(?:\\?\|[^\[\]\r\n]*)?\]\]/g
    for (const match of raw.matchAll(embed)) {
      collect(match[1].trim())
    }
  }
})

for (const name of images) {
  const input = path.join(source, name)
  // Compare against the vault path, not a resolved attachments root that might itself be a link.
  let resolved
  try {
    resolved = await realpath(input)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    console.warn(`Warning: ${log}: missing image: ${input}`)
    continue
  }
  if (resolved !== input || !(await stat(input)).isFile()) {
    throw new Error(`${log}: expected a regular, non-symlink attachment: ${input}`)
  }
  let dir = destination
  for (const part of ["", ...name.split("/").slice(0, -1)]) {
    dir = path.join(dir, part)
    await mkdir(dir, { recursive: true })
    if (!(await lstat(dir)).isDirectory()) throw new Error(`Not a real directory: ${dir}`)
  }
  // The publish workflow stages into a fresh directory. Never replace an existing entry.
  await copyFile(input, path.join(destination, name), constants.COPYFILE_EXCL)
}
