import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./sync-changelog-images.mjs", import.meta.url))

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "changelog-images-"))
  t.after(() => rm(dir, { recursive: true }))
  const vault = path.join(dir, "vault")
  const assets = path.join(vault, "attachments")
  const log = path.join(dir, "content/changelog")
  await mkdir(assets, { recursive: true })
  await mkdir(log, { recursive: true })
  return {
    assets,
    log,
    vault,
    run: () => spawnSync(process.execPath, [script, vault, log], { encoding: "utf8" }),
  }
}

test("copies only explicitly embedded image bytes and leaves the copied changelog unchanged", async (t) => {
  const { assets, log, vault, run } = await fixture(t)
  const pasted = "Pasted image 20010102030405.png"
  const markdown = [
    "---",
    'title: "![[unrelated.png]]"',
    "---",
    "",
    `![[${pasted}|571]]`,
    "![[bare.png]]",
    "![[attachments/nested/a.jpg|caption]]",
    "![ordinary](./attachments/nested/space%20name.webp)",
    "",
    "```md",
    "![[unrelated.png]]",
    "```",
    "",
    "    ![[unrelated.png]]",
    "",
    "`![code](unrelated.png)` and \\![[unrelated.png]]",
    "<!-- ![[unrelated.png]] -->",
    "%% not public",
    "![[unrelated.png]] %%",
    "[[unrelated.png]] unrelated.png",
    "[not an embed](attachments/unrelated.png) [**![[unrelated.png]]**](other)",
    "![remote](https://example.org/unrelated.png) ![[notes.md]] ![[private/outside.png]]",
    "![[attachments/../outside.png]] ![encoded](attachments/%2e%2e/outside.png)",
  ].join("\n")
  await writeFile(path.join(log, "index.md"), markdown)
  await writeFile(path.join(vault, "更新日志.md"), "![[unrelated.png]]")
  await writeFile(path.join(vault, "outside.png"), "private")
  await mkdir(path.join(assets, "nested"))
  for (const name of [
    pasted,
    "bare.png",
    "nested/a.jpg",
    "nested/space name.webp",
    "unrelated.png",
  ]) {
    await writeFile(path.join(assets, name), Buffer.from([0, 255, name.length]))
  }
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  const copied = path.join(log, "attachments")
  assert.deepEqual((await readdir(copied, { recursive: true })).sort(), [
    pasted,
    "bare.png",
    "nested",
    "nested/a.jpg",
    "nested/space name.webp",
  ])
  assert.deepEqual(
    await readFile(path.join(copied, pasted)),
    await readFile(path.join(assets, pasted)),
  )
  assert.equal(await readFile(path.join(log, "index.md"), "utf8"), markdown)
})

test("missing and malformed image references warn without blocking valid siblings", async (t) => {
  const { assets, log, run } = await fixture(t)
  await writeFile(path.join(log, "index.md"), "![[missing.png]] ![bad](bad%.png) ![[valid.png]]")
  await writeFile(path.join(assets, "valid.png"), "ok")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  for (const name of ["missing.png", "bad%.png"]) {
    assert.ok(
      result.stderr
        .split("\n")
        .some((line) => line.includes(`Warning: ${log}/index.md`) && line.includes(name)),
      result.stderr,
    )
  }
  assert.equal(await readFile(path.join(log, "attachments/valid.png"), "utf8"), "ok")
})

test("symlink escapes fail with the offending name", async (t) => {
  const { assets, log, vault, run } = await fixture(t)
  await writeFile(path.join(vault, "outside.png"), "private")
  await symlink(path.join(vault, "outside.png"), path.join(assets, "leak.png"))
  await writeFile(path.join(log, "index.md"), "![[leak.png]]")
  const result = run()
  assert.notEqual(result.status, 0)
  assert.ok(result.stderr.includes("leak.png"), result.stderr)
  assert.deepEqual(await readdir(log), ["index.md"])
})
