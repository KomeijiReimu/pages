import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { Repository } from "@napi-rs/simple-git"
import { glob, type GlobOptions } from "./glob"

async function writeFixture(root: string, relativePath: string, content = "fixture") {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "quartz-glob-"))
  Repository.init(root)
  await writeFixture(
    root,
    ".gitignore",
    ["/content/ignored/", "/content/reincluded/*", "!/content/reincluded/keep.md", ""].join("\n"),
  )
  await Promise.all([
    writeFixture(root, "content/visible.md"),
    writeFixture(root, "content/visible.png"),
    writeFixture(root, "content/ignored/note.md"),
    writeFixture(root, "content/ignored/attachment.png"),
    writeFixture(root, "content/reincluded/drop.md"),
    writeFixture(root, "content/reincluded/keep.md"),
    writeFixture(root, "content/quartz-private/secret.md"),
    writeFixture(root, "content/quartz-private/secret.png"),
  ])
  return root
}

async function fixtureGlob(root: string, options?: GlobOptions) {
  return (await glob("**/*.*", path.join(root, "content"), ["quartz-private"], options)).sort()
}

test("glob excludes Git-ignored Markdown and attachments by default", async (t) => {
  const root = await createFixture()
  t.after(() => rm(root, { recursive: true, force: true }))

  const expected = ["reincluded/keep.md", "visible.md", "visible.png"]
  assert.deepEqual(await fixtureGlob(root), expected)
  assert.deepEqual(await fixtureGlob(root, { includeGitignored: false }), expected)
})

test("glob can include Git-ignored files while retaining Quartz ignores", async (t) => {
  const root = await createFixture()
  t.after(() => rm(root, { recursive: true, force: true }))

  assert.deepEqual(await fixtureGlob(root, { includeGitignored: true }), [
    "ignored/attachment.png",
    "ignored/note.md",
    "reincluded/drop.md",
    "reincluded/keep.md",
    "visible.md",
    "visible.png",
  ])
})
