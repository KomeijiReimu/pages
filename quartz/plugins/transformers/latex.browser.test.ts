import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { Latex, KatexTransformerName } from "./latex"

const exec = promisify(execFile)
const require = createRequire(import.meta.url)

test("only the KaTeX transformer opts into the local site resources", () => {
  for (const engine of [undefined, "katex", "mathjax", "typst"] as const) {
    const plugin = Latex({ renderEngine: engine })
    assert.equal(plugin.name === KatexTransformerName, !engine || engine === "katex")
    assert.equal(plugin.externalResources, undefined)
  }
})

// KATEX_FIXTURE_PROBE=1 bunx tsx --test quartz/plugins/transformers/latex.browser.test.ts
test(
  "plain FCP, SSR math, copy-tex and local fonts survive direct and SPA visits",
  {
    skip: process.env.KATEX_FIXTURE_PROBE !== "1",
    timeout: 180_000,
  },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "quartz-katex-"))
    let closeBrowser: (() => Promise<string>) | undefined
    let server: ReturnType<typeof createServer> | undefined
    t.after(async () => {
      try {
        await closeBrowser?.()
      } finally {
        if (server?.listening) {
          server.closeAllConnections()
          await new Promise<void>((resolve) => server!.close(() => resolve()))
        }
        await rm(root, { recursive: true, force: true })
      }
    })
    const content = join(root, "content"),
      output = join(root, "public")
    const notes = join(content, "notes/lab")
    await mkdir(notes, { recursive: true })
    await mkdir(join(content, "about"))
    for (const [path, text] of [
      ["index", "Home"],
      ["about/index", "Plain about"],
      ["notes/lab/short", "Plain text. [[math|Read math]]"],
      ["notes/lab/math", "Inline $x^2+1$.\n\n$$\n\\frac{1}{2}\n$$\n\n[[short|Read plain]]"],
    ])
      await writeFile(
        join(content, path + ".md"),
        `---\ntitle: ${path}\nsocialImage: icon.png\n---\n${text}\n`,
      )
    await exec(process.execPath, [
      "quartz/bootstrap-cli.mjs",
      "build",
      "--concurrency=1",
      "-d",
      content,
      "-o",
      output,
    ])

    const css = await readFile(join(output, "index.css"), "utf8")
    const fontUrls = Array.from(
      css.matchAll(/url\(["']?(static\/katex\/fonts\/[^)"']+)/g),
      (m) => m[1],
    )
    assert.ok(fontUrls.some((f) => f.endsWith(".woff2")))
    for (const font of fontUrls) {
      assert.ok((await stat(join(output, font))).size > 0)
      assert.equal(
        new URL(font, "https://example.org/garden/index.css").pathname,
        `/garden/${font}`,
      )
    }
    const handler = require("serve-handler")
    server = createServer((req, res) => {
      // Third-party widgets are not part of this fixture. Direct no-JS also forbids
      // both local and inline scripts; neither case can use an external math asset.
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self' 'unsafe-inline' data: blob:; frame-src 'none';${req.url?.endsWith("?nojs") ? " script-src 'none';" : ""}`,
      )
      return handler(req, res, { public: output, directoryListing: false })
    })
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const browser = async (...args: string[]) =>
      (
        await exec(
          "agent-browser",
          ["--session", basename(root), "--profile", join(root, "browser"), ...args],
          { timeout: 45_000, env: { ...process.env, TMPDIR: root } },
        )
      ).stdout
    closeBrowser = () => browser("close")
    const evaluate = async (js: string) => JSON.parse(await browser("eval", js))
    for (const path of ["about/", "notes/lab/short", "notes/lab/math"]) {
      const html = await (await fetch(`${origin}/${path}`)).text()
      assert.doesNotMatch(html, /(?:href|src)="[^"]*(?:katex\.min\.css|copy-tex)/)
    }
    for (const path of ["about/", "notes/lab/short"]) {
      await browser("open", `${origin}/${path}`)
      await browser(
        "wait",
        "--fn",
        "performance.getEntriesByName('first-contentful-paint').length > 0",
      )
      assert.deepEqual(
        await evaluate(
          "performance.getEntriesByType('resource').filter(r => /katex|copy-tex/i.test(new URL(r.name).pathname)).map(r=>r.name)",
        ),
        [],
      )
      t.diagnostic(
        `${path} FCP: ${await evaluate("performance.getEntriesByName('first-contentful-paint')[0].startTime")}ms; 0 formula requests`,
      )
    }
    const styledMath = `async () => {
    const math = document.querySelector('article .katex'), visual = math.querySelector('.katex-html');
    await document.fonts.ready;
    return [math.querySelector('annotation').textContent, getComputedStyle(math).fontFamily.includes('KaTeX'), visual.getBoundingClientRect().width > 0, [...document.fonts].some(f => /KaTeX/.test(f.family) && f.status==='loaded')];
  }`
    const copy = `(() => {
    const range=document.createRange(); range.selectNodeContents(document.querySelector('article .katex-html'));
    const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const data=new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,cancelable:true}));
    return data.getData('text/plain');
  })()`
    await evaluate("window.fixtureShell=true")
    for (const slug of ["math", "short", "math"]) {
      await browser("click", `article a.internal[href$='${slug}']`)
      await browser("wait", "--fn", `document.body.dataset.slug==='notes/lab/${slug}'`)
      assert.equal(await evaluate("window.fixtureShell===true"), true, "actual SPA, not a reload")
      if (slug === "math") {
        assert.deepEqual(await evaluate(`(${styledMath})()`), ["x^2+1", true, true, true])
        assert.equal(await evaluate(copy), "$x^2+1$")
      }
    }
    await browser("open", `${origin}/notes/lab/math?nojs`)
    assert.equal(await evaluate("typeof window.spaNavigate"), "undefined")
    assert.deepEqual(await evaluate(`(${styledMath})()`), ["x^2+1", true, true, true])
    assert.equal(
      await evaluate("document.querySelector('article .katex-display annotation').textContent"),
      "\\frac{1}{2}",
    )
    t.diagnostic(
      `no-JS fonts: ${await evaluate("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).join(', ')")}`,
    )
  },
)
