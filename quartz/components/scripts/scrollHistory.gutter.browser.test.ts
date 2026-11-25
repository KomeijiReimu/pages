import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { build } from "esbuild"

// Opt-in: TMPDIR=/var/tmp CHROME_BIN=... PUPPETEER_MODULE=... tsx --test <this file>
test(
  "real router yields the native home scrollbar to the reader",
  {
    skip: !process.env.CHROME_BIN || !process.env.PUPPETEER_MODULE,
  },
  async (t) => {
    const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE!)
    const bundle = async (entry: string) =>
      (
        await build({
          entryPoints: [`quartz/components/scripts/${entry}.inline.ts`],
          bundle: true,
          format: "iife",
          write: false,
        })
      ).outputFiles[0].text
    const [head, router] = await Promise.all([bundle("komeiStartup"), bundle("spa")])
    let holdRouter: Promise<void> | undefined
    const server = createServer((req, res) => {
      res.setHeader("cache-control", "no-store")
      if (req.url === "/router.js") {
        res.setHeader("content-type", "text/javascript")
        if (holdRouter) void holdRouter.then(() => res.end(router))
        else res.end(router)
        return
      }
      const slug = req.url === "/" ? "index" : "article"
      res.setHeader("content-type", "text/html")
      res.end(`<!doctype html><head><style data-persist>html{overflow-y:scroll}body{height:8000px;margin:0}nav{position:fixed}</style>
      <script data-persist data-startup-slug="${slug}">${head}</script>
      <script defer data-persist src="/router.js"></script></head>
      <body data-slug="${slug}"><nav><a href="/">Home</a><a href="/article">Article</a></nav>${slug === "article" ? '<div id="above"></div>' + '<p style="height:200px">Reading position</p>'.repeat(30) : ""}</body>`)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    t.after(() => server.close())
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_BIN,
      headless: true,
      // Viewport emulation can deliver mouse events to DOM without moving the native thumb.
      defaultViewport: null,
      ignoreDefaultArgs: ["--hide-scrollbars"],
      args: ["--no-sandbox", "--disable-features=OverlayScrollbar"],
    })
    t.after(() => browser.close())
    const page = await browser.newPage()
    const drag = async () => {
      const x = await page.evaluate(() => {
        const right = document.documentElement.clientWidth
        if (innerWidth <= right) throw Error("no classic scrollbar")
        return Math.floor((right + innerWidth) / 2)
      })
      await page.mouse.move(x, 20)
      await page.mouse.down()
      await page.mouse.move(x, 180, { steps: 5 })
      await page.mouse.up()
      const dragged = await page.evaluate(() => scrollY)
      assert.ok(dragged > 500, `thumb drag must actually scroll, got ${dragged}`)
      return dragged
    }
    const retained = async (y: number) => {
      // Observe past the last correction; don't count a transient mid-drag position as a pass.
      await new Promise((resolve) => setTimeout(resolve, 1850))
      const settled = await page.evaluate(() => scrollY)
      console.log("native thumb: dragged, settled", y, settled)
      assert.equal(settled, y)
    }
    await t.test("fresh load, then SPA link to home", async () => {
      await page.goto(origin)
      await retained(await drag())
      await page.click('[href="/article"]')
      await page.waitForFunction(() => document.body.dataset.slug === "article")
      await page.click('[href="/"]')
      await page.waitForFunction(() => document.body.dataset.slug === "index" && scrollY === 0)
      await retained(await drag())
    })
    for (const savedY of [0, 1300])
      await t.test(`reload from ${savedY}: drag before the deferred router runs`, async () => {
        await page.goto(`${origin}/article`)
        await page.goto(origin)
        await page.evaluate((y: number) => scrollTo(0, y), savedY)
        await page.waitForFunction((y: number) => scrollY === y, {}, savedY)
        let release!: () => void
        holdRouter = new Promise<void>((resolve) => {
          release = resolve
        })
        const ready = page.reload({ waitUntil: "load" })
        try {
          await page.waitForFunction(
            () =>
              document.body && !window.spaNavigate && document.documentElement.scrollHeight > 2000,
          )
          assert.equal(await page.evaluate(() => scrollY), 0)
          // pagehide stores the outgoing viewport by entry id; the browser may
          // have snapshotted history.state itself before that final capture.
          const stored = await page.evaluate(() =>
            new Map(JSON.parse(sessionStorage.getItem("quartz-scroll-history-v1")!)).get(
              history.state.__quartzScroll.id,
            ),
          )
          assert.deepEqual(stored, { x: 0, y: savedY })
          const y = await drag()
          assert.ok(Math.abs(y - savedY) > 100)
          release()
          await ready
          await retained(y)
        } finally {
          holdRouter = undefined
          release()
          await ready
        }
      })
    await t.test("late SPA hash target remains restorable without input", async () => {
      await page.goto(origin)
      await page.evaluate(async () => {
        await window.spaNavigate(new URL("/article#late", location.href))
        const target = document.createElement("h2")
        target.id = "late"
        target.style.position = "absolute"
        target.style.top = "2800px"
        target.style.margin = "0"
        target.textContent = "Late heading"
        document.body.appendChild(target)
      })
      await page.waitForFunction(
        () =>
          scrollY >= 2700 &&
          Math.abs(document.getElementById("late")!.getBoundingClientRect().top) <= 1,
      )
    })
    await t.test("automatic scroll anchoring is not mistaken for a reader drag", async () => {
      await page.goto(`${origin}/article`)
      await page.evaluate(() => scrollTo(0, 1600))
      await page.click('[href="/"]')
      await page.waitForFunction(() => document.body.dataset.slug === "index")
      await page.evaluate(() => history.back())
      await page.waitForFunction(() => document.body.dataset.slug === "article" && scrollY === 1600)
      await page.evaluate(() => {
        document.getElementById("above")!.style.height = "500px"
      })
      await retained(1600)
    })
  },
)
