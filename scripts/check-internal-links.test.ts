import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createTestDirectory } from "../quartz/test/helpers/temp"

const checker = fileURLToPath(new URL("./check-internal-links.mjs", import.meta.url))

test("checks same-origin pages, assets and fragments using the published origin", async (t) => {
  const dir = await createTestDirectory(t, "internal-links-")
  const origin = "https://fixture.example:8443"
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [checker, dir, ...args], { encoding: "utf8" })
  await mkdir(path.join(dir, "notes"))
  await mkdir(path.join(dir, "empty"))
  await writeFile(
    path.join(dir, "sitemap.xml"),
    `<urlset><url><loc>${origin}/notes/page</loc></url></urlset>`,
  )
  await writeFile(path.join(dir, "asset.svg"), "<svg/>")
  await writeFile(
    path.join(dir, "notes/page.html"),
    '<p id="a&amp;b"><a href="#a%26b">Here</a></p>',
  )
  await writeFile(path.join(dir, "notes/index.html"), '<a name="legacy"></a>')
  const home = path.join(dir, "index.html")
  await writeFile(
    home,
    `
    <a href="${origin}/notes/page?q=1#a%26b">Clean URL</a>
    <a href="//fixture.example:8443/notes/#legacy">Index</a>
    <img src="${origin}/asset.svg?v=2">
    <a href="https://fixture.example/missing#none">Other port</a>
    <a href="https://third-party.example/missing">Other host</a>
    <a href="mailto:someone@example.org">Email</a>
    <!-- <img src="/commented-out.svg"> -->`,
  )
  const good = run()
  assert.equal(good.status, 0, good.stderr)

  const broken = [
    `${origin}/unknown/path`,
    "/empty",
    "/notes/page/",
    "#missing",
    "/notes/#missing",
    "/missing.js",
    "/missing.svg",
  ]
  await writeFile(
    home,
    broken
      .slice(0, 5)
      .map((href) => `<a href="${href}">broken</a>`)
      .join("") + '<script src="/missing.js"></script><link href="/missing.svg" rel="icon">',
  )
  const bad = run()
  assert.equal(bad.status, 1)
  for (const href of broken) assert.ok(bad.stderr.includes(` -> ${href} `), bad.stderr)
})

test("resolves dotted navigation and fragments without rewriting asset URLs", async (t) => {
  const dir = await createTestDirectory(t, "link-routes-")
  const origin = "https://fixture.example"
  const run = () => spawnSync(process.execPath, [checker, dir, origin], { encoding: "utf8" })
  await mkdir(path.join(dir, "notes/v4.5"), { recursive: true })
  await writeFile(path.join(dir, "notes/v4.5.html"), '<a id="page" href="#page">Page</a>')
  await writeFile(path.join(dir, "notes/v4.5/index.html"), '<a id="index" href="#index">Index</a>')
  await writeFile(path.join(dir, "manual.pdf"), "fixture")
  await writeFile(path.join(dir, "handout.pdf.html"), "not the attachment")
  await writeFile(path.join(dir, "style.css.html"), "not a stylesheet")
  await writeFile(path.join(dir, "poster.html"), "not a poster")
  await writeFile(path.join(dir, "404.html"), "not a fallback")
  const home = path.join(dir, "index.html")
  await writeFile(
    home,
    `<link rel="canonical" href="${origin}/notes/v4.5">
     <a href="${origin}/notes/v4.5?q=1#page">Clean URL</a>
     <a href="/notes/v4.5/#index">Folder</a>
     <a href="/notes/v4.5.html#page">Explicit page</a>
     <a href="/notes/v4.5/index.html#index">Explicit index</a>
     <a href="/manual.pdf">View manual</a><a download href="/manual.pdf">Download</a>
     <map name="article"><area href="/notes/v4.5#page"></map>
     <iframe src="/notes/v4.5#page"></iframe>`,
  )
  const good = run()
  assert.equal(good.status, 0, good.stderr)

  await writeFile(
    home,
    `<img src="/notes/v4.5"><a href="/notes/v4.5">Page</a>
     <link rel="stylesheet" href="/style.css"><video poster="/poster"></video>
     <a href="/notes/v4.5#index">Wrong page</a><a href="/notes/v4.5/#page">Wrong index</a>
     <a href="/unknown">Missing</a><a download href="/handout.pdf">Download</a>
     <map name="article"><area href="/notes/v4.5#missing-area"></map>
     <iframe src="/notes/v4.5#missing-iframe"></iframe>`,
  )
  const bad = run()
  assert.equal(bad.status, 1)
  for (const asset of ["/notes/v4.5", "/style.css", "/poster", "/unknown", "/handout.pdf"]) {
    assert.ok(bad.stderr.includes(` -> ${asset} 缺少目标文件`), bad.stderr)
  }
  for (const href of [
    "/notes/v4.5#index",
    "/notes/v4.5/#page",
    "/notes/v4.5#missing-area",
    "/notes/v4.5#missing-iframe",
  ]) {
    assert.ok(bad.stderr.includes(` -> ${href} 缺少目标锚点`), bad.stderr)
  }
})

test("checks inline SVG fragments in their source HTML and external sprite files exactly", async (t) => {
  const dir = await createTestDirectory(t, "link-svg-")
  const run = () =>
    spawnSync(process.execPath, [checker, dir, "https://fixture.example"], { encoding: "utf8" })
  await mkdir(path.join(dir, "notes"))
  const home = path.join(dir, "index.html")
  const page = path.join(dir, "notes/v4.5.html")
  await writeFile(path.join(dir, "sprite.svg"), '<svg><path id="icon"/></svg>')
  await writeFile(path.join(dir, "missing.svg.html"), "not the sprite")
  await writeFile(home, '<svg><path id="curve"/><text><textPath href="#curve"/></text></svg>')
  await writeFile(
    page,
    `<svg><path id="local"/><use href="#local"/><use href="/notes/v4.5#local"/>
     <use href="https://fixture.example/notes/v4.5#local"/><use href="../sprite.svg#icon"/></svg>`,
  )
  const good = run()
  assert.equal(good.status, 0, good.stderr)

  await writeFile(home, '<svg><path id="curve"/><text><textPath href="#local"/></text></svg>')
  await writeFile(
    page,
    `<svg><path id="local"/><use href="#curve"/><use href="/notes/v4.5#curve"/>
     <use href="https://fixture.example/notes/v4.5#curve"/><use href="/notes/v4.5?q=1#local"/>
     <use href="../missing.svg#icon"/></svg><img src="/notes/v4.5#local">`,
  )
  const bad = run()
  assert.equal(bad.status, 1)
  for (const message of [
    "/ -> #local 缺少目标锚点 #local",
    "/notes/v4.5 -> #curve 缺少目标锚点 #curve",
    "/notes/v4.5 -> /notes/v4.5#curve 缺少目标锚点 #curve",
    "/notes/v4.5 -> https://fixture.example/notes/v4.5#curve 缺少目标锚点 #curve",
    "/notes/v4.5 -> /notes/v4.5?q=1#local 缺少目标文件 /notes/v4.5",
    "/notes/v4.5 -> /notes/v4.5#local 缺少目标文件 /notes/v4.5",
    "/notes/v4.5 -> ../missing.svg#icon 缺少目标文件 /missing.svg",
  ]) {
    assert.ok(bad.stderr.includes(message), bad.stderr)
  }
})

test("requires an explicit site origin when no sitemap is present", async (t) => {
  const dir = await createTestDirectory(t, "link-origin-")
  await writeFile(path.join(dir, "index.html"), '<a href="https://example.org/">Home</a>')
  const missing = spawnSync(process.execPath, [checker, dir], { encoding: "utf8" })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /sitemap\.xml/)
  const supplied = spawnSync(process.execPath, [checker, dir, "https://example.org"], {
    encoding: "utf8",
  })
  assert.equal(supplied.status, 0, supplied.stderr)
})
