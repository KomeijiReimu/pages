import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { defaultProcessedContent } from "../plugins/vfile"
import type { BuildCtx } from "../util/ctx"
import type { FullSlug } from "../util/path"
import { isKnownNativeRoute, maxSpaResponseBytes } from "../util/nativeRoutes"
import { finalizeNativeRoutes } from "./nativeRouteHints"

test("native hints track final HTML bytes and current publications, not stale output", async (t) => {
  const output = await mkdtemp(path.join(os.tmpdir(), "quartz-hint-test-"))
  t.after(() => rm(output, { recursive: true, force: true }))
  const ctx = {
    argv: { output },
    cfg: { plugins: { emitters: [{ name: "ComponentResources" }] } },
  } as BuildCtx
  const content = (slug: string, tags: string[] = []) =>
    defaultProcessedContent({
      slug: slug as FullSlug,
      frontmatter: { title: "Public", tags },
    })
  const heavy = "字".repeat(Math.ceil((maxSpaResponseBytes + 1) / 3))
  const emit = async (slug: string, body: string) => {
    const dest = path.join(output, slug + ".html")
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, body)
    return dest
  }
  const bundle = path.join(output, "postscript.js")
  await writeFile(bundle, "/* original bundle */")
  const current = [content("空间 x/child", ["large"]), content("edge")]
  const files = new Set(
    await Promise.all([
      emit("空间 x/index", heavy),
      emit("tags/large", heavy),
      emit("edge", "x".repeat(maxSpaResponseBytes)),
      emit("withdrawn", heavy),
      emit("draft/index", heavy),
    ]),
  )
  await finalizeNativeRoutes(ctx, current, files, true)
  const hints = async () => {
    const js = await readFile(bundle, "utf8")
    const mockWindow = { location: new URL("https://example.org"), quartzNativeRoutes: undefined }
    new Function("window", js)(mockWindow)
    Object.defineProperty(globalThis, "window", { value: mockWindow, configurable: true })
    return (route: string) => isKnownNativeRoute(new URL(route, mockWindow.location))
  }
  t.after(() => Reflect.deleteProperty(globalThis, "window"))
  let has = await hints()
  for (const route of [
    "/空间 x",
    "/空间 x/",
    "/空间 x/index",
    "/空间 x/index.html?q=1#end",
    "/tags/large",
  ])
    assert.ok(has(route), route)
  for (const route of [
    "/edge",
    "/withdrawn",
    "/draft/",
    "/%",
    "/tags%2Flarge",
    "https://elsewhere.org/tags/large",
  ])
    assert.ok(!has(route), route)

  // A tag went away without its old HTML being removed. A leaf is now
  // large, the folder shrank (e.g. due to sidecar substitution).
  await finalizeNativeRoutes(
    ctx,
    [content("空间 x/child"), content("edge")],
    new Set([await emit("空间 x/index", "small"), await emit("edge", heavy)]),
    false,
  )
  has = await hints()
  assert.ok(has("/edge.html"))
  assert.ok(!has("/tags/large"))
  assert.ok(!has("/空间 x/"))
  await finalizeNativeRoutes(ctx, [], new Set(), false)
  assert.ok(!(await hints())("/edge"))
})
