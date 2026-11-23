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
