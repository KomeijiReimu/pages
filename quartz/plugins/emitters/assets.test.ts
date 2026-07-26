import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { Repository } from "@napi-rs/simple-git"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { Assets } from "./assets"

test("Assets copies Git-ignored attachments only when explicitly included", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "quartz-assets-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  Repository.init(root)
  const contentRoot = path.join(root, "content")
  await mkdir(contentRoot)
  await writeFile(path.join(root, ".gitignore"), "/content/ignored.bin\n")
  await writeFile(path.join(contentRoot, "visible.bin"), "visible")
  await writeFile(path.join(contentRoot, "ignored.bin"), "ignored")

  async function emit(includeGitignored: boolean, output: string) {
    const ctx = {
      argv: { directory: contentRoot, output, includeGitignored },
      cfg: { configuration: { ignorePatterns: [] } },
    } as unknown as BuildCtx
    const result = await Assets().emit(ctx, [], {} as StaticResources)
    const emitted: string[] = []
    for await (const file of result) emitted.push(file)
    return emitted.sort()
  }

  const defaultOutput = path.join(root, "default-output")
  assert.deepEqual(await emit(false, defaultOutput), [path.join(defaultOutput, "visible.bin")])
  await assert.rejects(access(path.join(defaultOutput, "ignored.bin")))

  const includeOutput = path.join(root, "include-output")
  assert.deepEqual(await emit(true, includeOutput), [
    path.join(includeOutput, "ignored.bin"),
    path.join(includeOutput, "visible.bin"),
  ])
  await access(path.join(includeOutput, "ignored.bin"))
})
