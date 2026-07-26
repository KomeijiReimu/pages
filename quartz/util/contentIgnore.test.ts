import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { Repository } from "@napi-rs/simple-git"
import { createContentIgnoreMatcher } from "./contentIgnore"
import { glob } from "./glob"

test("content watcher maps relative events to root Git ignores", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "quartz-content-ignore-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  Repository.init(root)
  await mkdir(path.join(root, "content"))
  await writeFile(path.join(root, ".gitignore"), "/content/notes/\n")

  const contentRoot = path.join(root, "content")
  const defaults = await createContentIgnoreMatcher({
    contentRoot,
    ignorePatterns: ["private", "nested/ignored"],
  })
  const included = await createContentIgnoreMatcher({
    contentRoot,
    ignorePatterns: ["private", "nested/ignored"],
    includeGitignored: true,
  })

  assert.equal(defaults("notes/x.md"), true)
  assert.equal(included("notes/x.md"), false)
  assert.equal(included("visible/x.md"), false)

  assert.equal(included("private/x.md"), true)
  assert.equal(included("nested/ignored/x.md"), true)
  assert.equal(included("nested/ignored/deeper/x.md"), true)
  assert.equal(included(".git/config"), true)
  assert.equal(included("folder/.hidden/x.md"), true)
})

test("content watcher falls back to a standalone content root", async (t) => {
  const contentRoot = await mkdtemp(path.join(tmpdir(), "quartz-standalone-content-"))
  t.after(() => rm(contentRoot, { recursive: true, force: true }))
  await writeFile(path.join(contentRoot, ".gitignore"), "/ignored/\n")

  const ignored = await createContentIgnoreMatcher({ contentRoot, ignorePatterns: [] })
  assert.equal(ignored("ignored/x.md"), true)
  assert.equal(ignored("visible/x.md"), false)
})

test("content watcher matches initial glob ignore semantics", async (t) => {
  const contentRoot = await mkdtemp(path.join(tmpdir(), "quartz-ignore-parity-"))
  t.after(() => rm(contentRoot, { recursive: true, force: true }))
  const files = [
    "root.md",
    "root.txt",
    "private/root.md",
    "private/root.txt",
    "nested/note.md",
    "nested/file.txt",
    "nested/private/note.md",
    "nested/private/file.txt",
  ]
  await Promise.all(
    files.map(async (relativePath) => {
      const filePath = path.join(contentRoot, relativePath)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, "fixture")
    }),
  )

  const cases = [
    { pattern: "!(*.md)", ignored: ["root.txt"] },
    { pattern: "private", ignored: ["private/root.md", "private/root.txt"] },
    { pattern: "private/", ignored: ["private/root.md", "private/root.txt"] },
    {
      pattern: "**/private",
      ignored: [
        "nested/private/file.txt",
        "nested/private/note.md",
        "private/root.md",
        "private/root.txt",
      ],
    },
    { pattern: "*.md", ignored: ["root.md"] },
    {
      pattern: "**/*.md",
      ignored: ["nested/note.md", "nested/private/note.md", "private/root.md", "root.md"],
    },
  ]

  for (const { pattern, ignored } of cases) {
    const initialFiles = new Set<string>(
      await glob("**/*.*", contentRoot, [pattern], { includeGitignored: true }),
    )
    const watcherIgnored = await createContentIgnoreMatcher({
      contentRoot,
      ignorePatterns: [pattern],
      includeGitignored: true,
    })
    const ignoredByGlob = files.filter((file) => !initialFiles.has(file)).sort()

    assert.deepEqual(ignoredByGlob, ignored, `initial glob: ${pattern}`)
    for (const file of files) {
      assert.equal(
        watcherIgnored(file),
        !initialFiles.has(file),
        `watcher parity: ${pattern} ${file}`,
      )
    }
  }
})
