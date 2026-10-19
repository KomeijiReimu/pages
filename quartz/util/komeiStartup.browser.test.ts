import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { createRequire } from "node:module"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { build } from "esbuild"
import { startupStyle } from "./komeiStartup"

// Opt-in integration coverage: real DOM, native IO and production GSAP/scripts.
// Lifecycle events below exercise cleanup, not trusted BFCache or visual timing.
test(
  "startup: paused release, post-startup IO and route cleanup",
  { skip: process.env.STARTUP_FIXTURE_PROBE !== "1", timeout: 60_000 },
  async () => {
    const compile = async (file: string) =>
      (await build({ entryPoints: [file], bundle: true, write: false, format: "esm" }))
        .outputFiles[0].text
    const [bootstrap, animations, gsap] = await Promise.all([
      compile("quartz/components/scripts/komeiStartup.inline.ts"),
      compile("quartz/components/scripts/komeiAnimations.inline.ts"),
      readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"), "utf8"),
    ])
    const profile = await mkdtemp(join(tmpdir(), "startup-regression-"))
    const execute = promisify(execFile)
    const browser = async (...args: string[]) =>
      (
        await execute(
          "agent-browser",
          ["--session", basename(profile), "--profile", profile, ...args],
          { timeout: 15_000 },
        )
      ).stdout
    const evaluate = async (expression: string) => JSON.parse(await browser("eval", expression))
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(`<!doctype html><html><head><style>${startupStyle}
        body{margin:0;height:3600px}.komei-home-hero{height:400px}
        .komei-post-card,.komei-category-card,.komei-module-card{position:absolute;height:150px;width:300px}
        .komei-post-card{top:500px}.komei-category-card{top:1400px}.komei-module-card{top:2500px}
        </style><script data-startup-slug="index">${bootstrap}</script>
        <script>${gsap};gsap.globalTimeline.pause()</script></head>
        <body data-slug="index"><div id="quartz-root">
        <section class="komei-home-hero"><h1>Public fixture</h1><aside class="komei-profile-card">Profile</aside></section>
        <article class="komei-post-card">Visible card</article>
        <a class="komei-category-card">Offscreen card</a>
        <article class="komei-module-card">Route cleanup</article></div>
        <script>window.addCleanup=()=>{};${animations};document.dispatchEvent(new CustomEvent('nav'));
        queueMicrotask(()=>{window.__pausedHero=gsap.getTweensOf(document.querySelectorAll('h1,.komei-profile-card')).length>0})</script>
        </body></html>`)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const port = (server.address() as { port: number }).port
      await browser("open", "about:blank")
      await browser("set", "viewport", "1440", "900")
      await browser("open", `http://127.0.0.1:${port}/`)
      assert.equal(
        await evaluate("window.__pausedHero"),
        true,
        "exercise actual paused Hero owners",
      )
      await browser("press", "Tab")
      assert.equal(
        await evaluate(`(async()=>{gsap.globalTimeline.resume();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          return !document.documentElement.dataset.komeiVeil&&!document.querySelector('[data-komei-entry]')&&
            [...document.querySelectorAll('h1,.komei-profile-card')].every(e=>!e.style.opacity&&!e.style.transform)&&
            gsap.getTweensOf(document.querySelectorAll('h1,.komei-profile-card')).length===0})()`),
        true,
        "resuming a released Hero cannot restore queued hidden states",
      )
      await browser("wait", "--fn", "performance.now()>6100")
      await browser("scroll", "down", "400")
      await browser(
        "wait",
        "--fn",
        "document.querySelector('.komei-category-card').style.opacity==='0.7'",
      )
      await browser("scroll", "down", "200")
      await browser(
        "wait",
        "--fn",
        "!!(window.__tween=gsap.getTweensOf(document.querySelector('.komei-category-card')).find(t=>t.duration()>0))",
      )
      assert.equal(await evaluate("__tween.duration()"), 0.62)
      assert.equal(
        await evaluate(
          "gsap.getTweensOf(document.querySelector('.komei-category-card').parentElement).length",
        ),
        0,
      )
      await browser("wait", "--fn", "__tween.progress()===1")
      await browser("scroll", "up", "200")
      await browser("scroll", "down", "200")
      assert.equal(
        await evaluate(`(()=>{const e=document.querySelector('.komei-category-card'),p=document.querySelector('.komei-post-card');
          return gsap.getTweensOf([e,p]).length===0&&!e.style.opacity&&!e.style.transform&&!p.style.opacity&&!p.style.transform})()`),
        true,
        "completed and already-exposed cards do not replay",
      )
      await browser("eval", "gsap.globalTimeline.pause()")
      await browser("scroll", "down", "900")
      await browser(
        "wait",
        "--fn",
        "document.querySelector('.komei-module-card').style.opacity==='0.7'",
      )
      assert.equal(
        await evaluate(`(async()=>{dispatchEvent(new PageTransitionEvent('pagehide'));gsap.globalTimeline.resume();
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const e=document.querySelector('.komei-module-card');
          return !e.style.opacity&&!e.style.transform&&!e.style.willChange&&gsap.getTweensOf(e).length===0})()`),
        true,
        "pagehide cancels prearmed setters before restoring styles",
      )
    } finally {
      try {
        await browser("close")
      } finally {
        server.closeAllConnections()
        if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
        await rm(profile, { recursive: true, force: true })
      }
    }
  },
)
