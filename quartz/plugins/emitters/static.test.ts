import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { Repository } from "@napi-rs/simple-git"
import { Static } from "./static"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"

test("Static keeps its default Git-ignore protection", async () => {
  const originalCwd = process.cwd()
  const root = await mkdtemp(path.join(tmpdir(), "quartz-static-"))

  try {
    Repository.init(root)
    await mkdir(path.join(root, "quartz/static"), { recursive: true })
    await writeFile(path.join(root, ".gitignore"), "/quartz/static/ignored.bin\n")
    await writeFile(path.join(root, "quartz/static/kept.bin"), "kept")
    await writeFile(path.join(root, "quartz/static/ignored.bin"), "ignored")
    process.chdir(root)

    const ctx = {
      argv: {
        output: "output",
        includeGitignored: true,
      },
      cfg: {
        configuration: {
          ignorePatterns: [],
        },
      },
    } as unknown as BuildCtx

    const result = await Static().emit(ctx, [], {} as StaticResources)
    const emitted: string[] = []
    for await (const file of result) emitted.push(file)

    assert.deepEqual(emitted, ["output/static/kept.bin"])
    await assert.rejects(access(path.join(root, "output/static/ignored.bin")))
  } finally {
    process.chdir(originalCwd)
    await rm(root, { recursive: true, force: true })
  }
})
