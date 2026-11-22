// Synthetic production build + real Chromium. No private content or browser dependency in the site.
// Usage: TMPDIR=/var/tmp CHROME_BIN=/path/to/chromium PUPPETEER_MODULE=/path/to/puppeteer-core/.../puppeteer-core.js node scripts/verify-code-gutter.mjs [fixtureOutputDir]
// Set KEEP_GUTTER=1 to retain generated HTML and screenshot evidence (otherwise removed on exit).
// To compare a baseline, run this same script from its source tree (or pass a prebuilt fixture directory).
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import handler from "serve-handler"
import sharp from "sharp"

const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? "puppeteer-core")
const dir = mkdtempSync(path.join(tmpdir(), "quartz-gutter-"))
if (process.env.KEEP_GUTTER !== "1")
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }))
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dir, "site")
console.log({ output, evidence: dir })
if (!process.argv[2]) {
  const input = path.join(dir, "input")
  mkdirSync(input)
  const fence = (info, source) => "```" + info + "\n" + source + "\n```\n\n"
  const lines = Array.from({ length: 1201 }, (_, i) =>
    i === 20 ? "" : i === 8 ? "// " + "x".repeat(500) : `const value${i} = ${i}`,
  )
  writeFileSync(
    path.join(input, "lines.md"),
    "# Gutter fixture\n\n" +
      fence("js showLineNumbers{98} {2}", lines.join("\n")) +
      fence("js", "const n = 1\n\nconst m = 2") +
      fence("", "unnumbered\nexample"),
  )
  writeFileSync(
    path.join(input, "extreme.md"),
    "# Virtualization\n\n" +
      Array.from({ length: 260 }, (_, i) =>
        fence("ts showLineNumbers{20}", `let first${i} = 1\n\nlet last${i} = 3`),
      ).join(""),
  )
  execFileSync("bun", ["run", "quartz", "build", "-d", input, "-o", output, "--concurrency", "1"], {
    stdio: "inherit",
  })
}

const server = createServer((req, res) => handler(req, res, { public: output }))
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN,
  headless: true,
  args: ["--no-sandbox", "--no-zygote", "--disable-dev-shm-usage"],
})
try {
  console.log(await browser.version())
  const page = await browser.newPage()
  await browser
    .defaultBrowserContext()
    .overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
  await page.setRequestInterception(true)
  page.on("request", (r) =>
    r.url().startsWith(origin) || r.url().startsWith("data:") ? r.continue() : r.abort(),
  )
  await page.evaluateOnNewDocument(() => {
    // Drive only idle callbacks; leave real intersection, scrolling, CSS, and layout in place.
    let next = 0
    const pending = new Map()
    window.requestIdleCallback = (cb) => (pending.set(++next, cb), next)
    window.cancelIdleCallback = (id) => pending.delete(id)
    window.stepIdle = () => {
      const entry = pending.entries().next().value
      if (entry) {
        pending.delete(entry[0])
        entry[1]({ didTimeout: true, timeRemaining: () => 50 })
      }
    }
  })

  const selector = 'pre[data-code-lines="1201"] > code'
  async function checkCopy() {
    const selected = await page.$eval(selector, (c) => {
      const r = document.createRange(),
        s = getSelection()
      r.selectNodeContents(c)
      s.removeAllRanges()
      s.addRange(r)
      const text = s.toString()
      s.removeAllRanges()
      c.parentElement.querySelector(".clipboard-button").click()
      const expected = JSON.parse(c.dataset.clipboard)
      return { matches: text === expected, expected }
    })
    assert.ok(selected.matches, "native selection must contain only source, including blank lines")
    await page.waitForFunction(
      async (expected) => (await navigator.clipboard.readText()) === expected,
      {},
      selected.expected,
    )
  }
  async function state() {
    return page.$eval(selector, (c) => {
      const p = c.parentElement
      const range = document.createRange()
      const source = document.createTreeWalker(c, NodeFilter.SHOW_TEXT).nextNode()
      range.setStart(source, 0)
      range.setEnd(source, 1)
      const r = range.getBoundingClientRect(),
        rect = c.getBoundingClientRect()
      return {
        count: c.childElementCount,
        lineNodes: c.querySelectorAll("[data-line]").length,
        gutter: c.dataset.komeiGutter?.split("\n"),
        pseudo: getComputedStyle(c, "::before").content.slice(0, 22),
        chunks: Number(p.dataset.komeiHydratedChunks),
        textX: r.x,
        textY: r.y,
        left: rect.x,
        top: rect.y,
        height: rect.height,
        lineHeight: parseFloat(getComputedStyle(c).lineHeight),
        scrollWidth: c.scrollWidth,
        width: c.clientWidth,
      }
    })
  }
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 800 })
    await page.goto(origin + "/lines.html", { waitUntil: "load" })
    await page.$eval(selector, (c) => c.scrollIntoView({ block: "start", behavior: "instant" }))
    await page.evaluate(() => window.scrollBy({ top: -140, behavior: "instant" }))
    const raw = await state()
    console.log(width, { ...raw, gutter: raw.gutter?.length })
    assert.ok(raw.height > 1000 && raw.width > 0, "fixture must actually be visible")
    assert.match(raw.pseudo, /98/, "raw SSR needs a painted gutter before the first idle callback")
    assert.deepEqual(
      raw.gutter,
      Array.from({ length: 1201 }, (_, i) => String(98 + i)),
    )
    assert.equal(raw.count, 0)
    assert.ok(raw.scrollWidth > raw.width)

    // Compare actual painted pixels, not just the presence of a data attribute.
    const clip = {
      x: Math.ceil(raw.left + 1),
      y: Math.ceil(raw.top + (await page.evaluate(() => scrollY)) + 8),
      width: Math.floor(raw.textX - raw.left - 4),
      height: Math.floor(raw.lineHeight * 4),
    }
    const painted = await page.screenshot({ clip, path: path.join(dir, `gutter-${width}.png`) })
    const hide = await page.addStyleTag({
      content: "code[data-komei-gutter]::before { opacity: 0 !important }",
    })
    const hidden = await page.screenshot({ clip })
    await hide.evaluate((s) => s.remove())
    const [a, b] = await Promise.all(
      [painted, hidden].map((img) => sharp(img).removeAlpha().raw().toBuffer()),
    )
    const changedPixels = []
    for (let row = 0; row < 4; row++) {
      let changed = 0
      for (
        let i = Math.floor(row * raw.lineHeight) * clip.width * 3;
        i < Math.floor((row + 1) * raw.lineHeight) * clip.width * 3;
        i += 3
      )
        if (Math.abs(a[i] - b[i]) > 10) changed++
      assert.ok(changed > 5, `no visible glyph pixels on row ${row + 1}: ${changed}`)
      changedPixels.push(changed)
    }
    await page.$eval(selector, (c) => {
      c.scrollLeft = 180
    })
    assert.ok(Math.abs(raw.textX - (await state()).textX - 180) <= 1)
    const scrolled = await page.screenshot({ clip })
    const offscreen = await page.addStyleTag({
      content: "code[data-komei-gutter]::before { opacity: 0 !important }",
    })
    const scrolledHidden = await page.screenshot({ clip })
    await offscreen.evaluate((s) => s.remove())
    assert.deepEqual(
      await sharp(scrolled).raw().toBuffer(),
      await sharp(scrolledHidden).raw().toBuffer(),
      "gutter must move with source, not overlap it during horizontal scrolling",
    )
    await page.$eval(selector, (c) => {
      c.scrollLeft = 0
    })
    await checkCopy()
    assert.deepEqual(
      await page.$$eval("article pre > code", (codes) =>
        codes.map((c) => c.dataset.komeiGutter?.split("\n")[0] ?? null),
      ),
      ["98", "1", null],
    )

    await page.waitForFunction(
      (s) => {
        window.stepIdle()
        return Number(document.querySelector(s).parentElement.dataset.komeiHydratedChunks) > 0
      },
      {},
      selector,
    )
    const partial = await state()
    assert.ok(partial.lineNodes > 0 && partial.lineNodes <= 12)
    assert.ok(
      Math.abs(raw.textX - partial.textX) < 1 &&
        Math.abs(raw.textY - partial.textY) < 1 &&
        Math.abs(raw.height - partial.height) < 1,
      "chunk swap must not shift source or gutter",
    )
    await checkCopy()
    console.log(width, {
      changedPixels,
      firstChunkRows: partial.lineNodes,
      sourceShift: partial.textX - raw.textX,
      heightShift: partial.height - raw.height,
    })
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    )
    await page.waitForFunction(() => {
      window.stepIdle()
      return document.querySelectorAll("article pre")[1].dataset.komeiCodeHydrated === "true"
    })
    const small = await page.$$eval("article pre", (ps) => {
      const p = ps[1],
        c = p.querySelector("code"),
        rows = [...c.querySelectorAll("[data-line]")]
      return {
        rows: rows.map((r) => r.textContent),
        heights: rows.map((r) => r.getBoundingClientRect().height),
        copy: JSON.parse(c.dataset.clipboard),
      }
    })
    assert.equal(small.rows.join("\n"), small.copy)
    assert.ok(small.heights[0] > 0 && small.heights.every((h) => h === small.heights[0]))
  }
  await page.goto(origin + "/extreme.html", { waitUntil: "load" })
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("article pre")].at(-1)?.dataset.komeiCodeVirtualized === "true",
  )
  const probe = await page.evaluateHandle(() =>
    [...document.querySelectorAll("article pre")].at(-1),
  )
  await probe.evaluate((p) => p.scrollIntoView({ behavior: "instant", block: "center" }))
  await page.waitForFunction(
    (p) => {
      window.stepIdle()
      return !p.dataset.komeiCodeVirtualized
    },
    {},
    probe,
  )
  assert.deepEqual(
    await probe.evaluate((p) => {
      const c = p.querySelector("code")
      return [
        c.textContent,
        JSON.parse(c.dataset.clipboard),
        c.dataset.komeiGutter,
        c.childElementCount,
      ]
    }),
    [
      "let first259 = 1\n \nlet last259 = 3",
      "let first259 = 1\n \nlet last259 = 3",
      "20\n21\n22",
      0,
    ],
  )
  await page.waitForFunction(
    (p) => {
      window.stepIdle()
      return p.dataset.komeiCodeHydrated === "true"
    },
    {},
    probe,
  )
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await page.waitForFunction(
    (p) => {
      window.stepIdle()
      return p.dataset.komeiCodeVirtualized === "true"
    },
    {},
    probe,
  )
  assert.equal(await probe.evaluate((p) => p.querySelector("code").textContent), "")
  await probe.evaluate((p) => p.scrollIntoView({ block: "center", behavior: "instant" }))
  await page.waitForFunction(
    (p) => {
      window.stepIdle()
      return p.dataset.komeiCodeHydrated === "true"
    },
    {},
    probe,
  )
  assert.deepEqual(
    await probe.evaluate((p) => [...p.querySelectorAll("[data-line]")].map((r) => r.textContent)),
    ["let first259 = 1", " ", "let last259 = 3"],
  )
  console.log(
    "PASS: default/offset, pixels, raw/chunk alignment, blank rows, selection, horizontal scroll and virtual restore",
  )
} finally {
  await browser.close()
  server.close()
}
