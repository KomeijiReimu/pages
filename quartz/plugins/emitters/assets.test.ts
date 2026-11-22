import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { Repository } from "@napi-rs/simple-git"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { Assets } from "./assets"
import sharp from "sharp"
import { glob } from "../../util/glob"
import { isGalleryInput, loadGalleryPhotos } from "../../util/gallery"
import { type FilePath } from "../../util/path"
import { komeijireimuConfig } from "../../komeijireimu.config"
import type { ChangeEvent } from "../types"

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

test("gallery cards use the selected content directory, published paths and original aspect ratio", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "quartz-gallery-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  Repository.init(root)
  const directory = path.join(root, "custom content")
  const output = path.join(root, "site")
  const ignorePatterns = ["**/private/**"]
  const ctx = {
    argv: { directory, output },
    cfg: { configuration: { ignorePatterns } },
    allFiles: [],
  } as unknown as BuildCtx
  const res = {} as StaticResources
  const emitter = Assets()
  const gallery = komeijireimuConfig.homepage.gallery
  const defaultSource = gallery.sourceDir
  t.after(() => {
    gallery.sourceDir = defaultSource
  })
  gallery.sourceDir = "content/相册 A"
  await mkdir(directory)
  assert.deepEqual(await loadGalleryPhotos(ctx), [])
  const base = "相册 A/小 河"
  const jpg = `${base}/图 片.jpg` as FilePath
  const png = `${base}/图 片.png` as FilePath
  const other = "相册 A/另一处/图 片.jpg"
  const jpgOut = "相册-A/小-河/图-片.jpg"
  const preview = `static/gallery/${jpgOut}.webp`
  for (const subdir of [base, "相册 A/private", "相册 A/另一处"])
    await mkdir(path.join(directory, subdir), { recursive: true })
  const pixels = sharp({ create: { width: 1600, height: 900, channels: 3, background: "red" } })
  const original = await pixels.clone().withMetadata({ orientation: 6 }).jpeg().toBuffer()
  await writeFile(path.join(directory, jpg), original)
  await writeFile(path.join(directory, other), original)
  await pixels.clone().png().toFile(path.join(directory, png))
  await writeFile(path.join(directory, "相册 A/private/笔记.jpg"), "not an image")
  await writeFile(path.join(directory, "相册 A/ignored.jpg"), "not an image")
  await writeFile(
    path.join(root, ".gitignore"),
    "/custom content/相册 A/ignored.jpg\n/custom content/相册 A/_gallery.yml\n",
  )
  await writeFile(path.join(directory, "相册 A/_gallery.yml"), "private: [invalid yaml")
  await writeFile(
    path.join(directory, "相册 A/_gallery.yaml"),
    "photos:\n  小 河/图 片.png:\n    order: 1\n    alt: 晴天\n",
  )
  ctx.allFiles = await glob("**/*.*", directory, ignorePatterns)
  const files = await Array.fromAsync(await emitter.emit(ctx, [], res))
  assert.equal(files.filter((f) => f.includes("/static/gallery/")).length, 3)
  assert.deepEqual(await readFile(path.join(output, jpgOut)), original)
  assert.deepEqual(await readFile(path.join(directory, jpg)), original)
  const cards = await loadGalleryPhotos(ctx)
  assert.equal(cards.length, 3)
  assert.equal(cards[0].alt, "晴天")
  assert.equal(isGalleryInput("相册 A/_gallery.yaml"), true)
  assert.equal(isGalleryInput("相册 A/note.md"), false)
  for (const card of cards) {
    const meta = await sharp(path.join(output, card.src)).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format], [card.width, card.height, "webp"])
  }

  async function partial(change: ChangeEvent) {
    await Array.fromAsync((await emitter.partialEmit!(ctx, [], res, [change]))!)
  }
  const before = await readFile(path.join(output, preview))
  await pixels.clone().jpeg().toFile(path.join(directory, jpg))
  await partial({ type: "change", path: jpg })
  assert.notDeepEqual(await readFile(path.join(output, preview)), before)
  await rm(path.join(directory, jpg))
  await partial({ type: "delete", path: jpg })
  await assert.rejects(access(path.join(output, jpgOut)), { code: "ENOENT" })
  await assert.rejects(access(path.join(output, preview)), { code: "ENOENT" })
  await access(path.join(output, "static/gallery/相册-A/小-河/图-片.png.webp"))
})
