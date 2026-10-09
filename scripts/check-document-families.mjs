import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const contentDir = path.join(root, ".quartz-cache/document-family-e2e-content")
const outputDir = path.join(root, ".quartz-cache/document-family-e2e-output")
const ownerFile = ".document-family-e2e-owner"
const owner = "quartz-document-family-e2e-v1\n"

// Do not reuse/delete pre-existing ignored directories unless this script created them.
async function prepareOwnedDirectory(directory) {
  try {
    const stat = await fs.lstat(directory)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `拒绝使用非普通目录：${directory}`)
    assert.equal(
      await fs.readFile(path.join(directory, ownerFile), "utf8"),
      owner,
      `拒绝覆盖非本脚本创建的目录：${directory}`,
    )
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    // A missing owner file on an existing directory must not count as a new directory.
    try {
      await fs.lstat(directory)
      throw new Error(`目录已存在但没有本脚本标识，拒绝覆盖：${directory}`)
    } catch (statError) {
      if (statError.code !== "ENOENT") throw statError
    }
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, ownerFile), owner)
  }
}

function markdown(title, body = "虚构测试内容。", extra = "") {
  return `---\ntitle: ${JSON.stringify(title)}\n${extra}---\n${body}\n`
}

const fixtures = {
  "index.md": markdown("虚构测试首页"),
  "notes/容器/docker/_family.md": markdown(
    "FAMILY_MARKER_DOCKER",
    '虚构 Docker 简介第一段。\n\n第二段保留换行。\n<b data-family-test="literal">仅作文字</b>',
    'main: "./Docker 系统笔记.md"\naliases: [family-hidden-alias]\npermalink: family-hidden-permalink\n',
  ),
  "notes/容器/docker/Docker 系统笔记.md": markdown("Docker 完整指南（独立标题）"),
  "notes/容器/docker/操作速查.md": markdown("操作速查"),
  "notes/容器/docker/_family-notes.md": markdown("相似名称普通笔记"),
  "notes/容器/docker/基础/安装.md": markdown("基础安装"),
  "notes/容器/docker/网络/配置.md": markdown("网络配置"),
  "notes/容器/k8s/_family.md": markdown("FAMILY_MARKER_K8S", "", 'main: "集群 入门.md"\n'),
  "notes/容器/k8s/集群 入门.md": markdown("Kubernetes 起步"),
  "notes/ordinary/page.md": markdown("普通目录笔记"),
  "notes/missing/_family.md": markdown(
    "FAMILY_MARKER_MISSING",
    "不得公开的无效简介",
    'main: "不存在.md"\n',
  ),
  "notes/missing/page.md": markdown("缺失目标目录的普通笔记"),
  "notes/draft-main/_family.md": markdown(
    "FAMILY_MARKER_DRAFT_MAIN",
    "不得公开的草稿关联简介",
    'main: "主笔记.md"\n',
  ),
  "notes/draft-main/主笔记.md": markdown(
    "FAMILY_DRAFT_TARGET",
    "草稿内容不得公开",
    "draft: true\n",
  ),
  "notes/draft-main/page.md": markdown("草稿目标目录的普通笔记"),
  "notes/draft-marker/_family.md": markdown(
    "FAMILY_MARKER_DRAFT",
    "不得公开的草稿标记简介",
    'main: "main.md"\ndraft: true\n',
  ),
  "notes/draft-marker/main.md": markdown("草稿标记目录的普通主笔记"),
  "notes/outside/_family.md": markdown(
    "FAMILY_MARKER_OUTSIDE",
    "不得公开的越界简介",
    'main: "../ordinary/page.md"\n',
  ),
  "notes/outside/page.md": markdown("越界目标目录的普通笔记"),
  "notes/no-main/_family.md": markdown("FAMILY_MARKER_NO_MAIN", "不得公开的缺字段简介"),
  "notes/no-main/page.md": markdown("缺字段目录的普通笔记"),
  "notes/index-main/_family.md": markdown(
    "FAMILY_MARKER_INDEX",
    "不得公开的索引关联简介",
    'main: "index.md"\n',
  ),
  "notes/index-main/index.md": markdown("索引目录"),
  "notes/index-main/page.md": markdown("索引目录普通笔记"),
}

await prepareOwnedDirectory(contentDir)
await prepareOwnedDirectory(outputDir)
for (const [filename, value] of Object.entries(fixtures)) {
  const destination = path.join(contentDir, filename)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, value)
}

console.log("使用自建虚构夹具构建；不读取或复制私人 notes/posts。")
const result = spawnSync(
  process.versions.bun ? process.execPath : "bun",
  [
    "quartz/bootstrap-cli.mjs",
    "build",
    "--directory",
    contentDir,
    "--output",
    outputDir,
    "--include-gitignored",
    "--concurrency",
    "1",
  ],
  { cwd: root, stdio: "inherit" },
)
if (result.error) throw result.error
// Quartz recreates the output directory; retain ownership even after a failed build.
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, ownerFile), owner)
assert.equal(result.status, 0, "Quartz 夹具构建失败")

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const filename = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(filename) : [filename]
      }),
    )
  ).flat()
}

function decodeAttribute(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
}

function hasClass(html, className) {
  return [...html.matchAll(/\bclass=["']([^"']*)["']/g)].some((match) =>
    match[1].split(/\s+/).includes(className),
  )
}

function familyButtonHref(html) {
  for (const match of html.matchAll(/<a\b([^>]*)>/g)) {
    if (hasClass(match[1], "komei-document-family__button")) {
      const href = match[1].match(/\bhref=["']([^"']+)["']/)
      assert.ok(href, "主笔记按钮必须有 href")
      return decodeAttribute(href[1])
    }
  }
  assert.fail("未找到主笔记按钮")
}

const outputFiles = await walk(outputDir)
assert.ok(outputFiles.length > 0)
assert.ok(
  !outputFiles.some((filename) => path.basename(filename) === "_family.html"),
  "标记不得生成 HTML",
)
assert.ok(
  !outputFiles.some((filename) => /family-hidden-(?:alias|permalink)\.html$/.test(filename)),
  "标记不得生成别名重定向",
)
for (const filename of outputFiles.filter((filename) => /\.(?:html|json|xml)$/.test(filename))) {
  const value = await fs.readFile(filename, "utf8")
  assert.ok(!value.includes("FAMILY_MARKER_"), `标记标题泄漏：${filename}`)
  assert.ok(!value.includes("FAMILY_DRAFT_TARGET"), `草稿泄漏：${filename}`)
  assert.ok(
    !value.includes("family-hidden-alias") && !value.includes("family-hidden-permalink"),
    `标记别名泄漏：${filename}`,
  )
  assert.ok(!value.includes("不得公开的"), `无效标记简介泄漏：${filename}`)
}

const contentIndex = JSON.parse(
  await fs.readFile(path.join(outputDir, "static/contentIndex.json"), "utf8"),
)
assert.ok(Object.keys(contentIndex).every((slug) => !/(?:^|\/)\_family$/.test(slug)))
assert.ok(contentIndex["notes/容器/docker/Docker-系统笔记"])
assert.ok(contentIndex["notes/容器/docker/_family-notes"])
assert.ok(!contentIndex["notes/draft-main/主笔记"])
for (const filename of ["sitemap.xml", "index.xml"]) {
  const value = await fs.readFile(path.join(outputDir, filename), "utf8")
  assert.ok(!/(?:\/|%2F)_family(?:<|\/|\s)/i.test(value), `${filename} 不得包含标记 URL`)
}

const docker = await fs.readFile(path.join(outputDir, "notes/容器/docker/index.html"), "utf8")
assert.ok(hasClass(docker, "komei-document-family"), "Docker 目录应有主题提示")
assert.ok(hasClass(docker, "komei-document-family__description"), "非空简介应显示")
assert.ok(hasClass(docker, "komei-document-family__notice"), "目录应有提示说明")
assert.ok(docker.includes("虚构 Docker 简介第一段。") && docker.includes("第二段保留换行。"))
assert.ok(
  docker.includes("&lt;b") && !docker.includes('<b data-family-test="literal">'),
  "简介中的 HTML 必须按文字转义",
)
for (const title of [
  "Docker 完整指南（独立标题）",
  "操作速查",
  "相似名称普通笔记",
  "基础",
  "网络",
]) {
  assert.ok(docker.includes(title), `目录条目应保留：${title}`)
}
const origin = "https://document-family.invalid"
const dockerLink = new URL(familyButtonHref(docker), `${origin}/notes/容器/docker/index`)
assert.equal(decodeURIComponent(dockerLink.pathname), "/notes/容器/docker/Docker-系统笔记")
assert.ok(outputFiles.includes(path.join(outputDir, "notes/容器/docker/Docker-系统笔记.html")))

const k8s = await fs.readFile(path.join(outputDir, "notes/容器/k8s/index.html"), "utf8")
assert.ok(hasClass(k8s, "komei-document-family"))
assert.ok(!hasClass(k8s, "komei-document-family__description"), "空简介不应渲染占位")
const k8sLink = new URL(familyButtonHref(k8s), `${origin}/notes/容器/k8s/index`)
assert.equal(decodeURIComponent(k8sLink.pathname), "/notes/容器/k8s/集群-入门")
for (const folder of [
  "ordinary",
  "missing",
  "draft-main",
  "draft-marker",
  "outside",
  "no-main",
  "index-main",
  "容器/docker/基础",
  "容器/docker/网络",
  "容器",
]) {
  const html = await fs.readFile(path.join(outputDir, `notes/${folder}/index.html`), "utf8")
  assert.ok(
    !hasClass(html, "komei-document-family"),
    `普通/无效/祖先/子目录不应有继承提示：${folder}`,
  )
}
console.log(`document-family e2e 通过。夹具：${contentDir}；产物：${outputDir}`)
