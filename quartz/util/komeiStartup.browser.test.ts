import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { createRequire } from "node:module"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { build } from "esbuild"
import { runInNewContext } from "node:vm"
import { startupStyle } from "./komeiStartup"

// Callback-order coverage only: this mock does not claim native IO or visual fidelity.
test("startup: first exposure survives 17px, open/history and a 260px skipped band", async () => {
  const script = (
    await build({
      entryPoints: ["quartz/components/scripts/komeiAnimations.inline.ts"],
      bundle: true,
      write: false,
      format: "iife",
    })
  ).outputFiles[0].text
  for (const preparedWhileCovered of [false, true]) {
    for (const viewportFirst of [false, true]) {
      class Card {
        style = {
          willChange: "",
          getPropertyValue: () => "",
          getPropertyPriority: () => "",
          setProperty() {},
          removeProperty() {},
        }
        contains(target: unknown) {
          return this === target
        }
      }
      const cards = [new Card(), new Card(), new Card()]
      type Entry = {
        target: Card
        isIntersecting: boolean
        time?: number
        boundingClientRect: { top: number; bottom: number }
      }
      const observers: Observer[] = []
      class Observer {
        constructor(readonly callback: (entries: Entry[]) => void) {
          observers.push(this)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      const attrs = new Map<string, string>()
      const container = {}
      const doc = Object.assign(new EventTarget(), {
        documentElement: {
          getAttribute: (key: string) => attrs.get(key),
          setAttribute: (key: string, value: string) => attrs.set(key, value),
        },
        body: { dataset: { slug: "index" } },
        querySelector: (selector: string) => (selector === "#quartz-root" ? container : null),
        querySelectorAll: (selector: string) =>
          selector.includes(".komei-post-card") ? cards : [],
      })
      let open = false,
        historyReads = 0
      let history: Array<{ top: number; bottom: number }> | undefined
      let notifyOpen = () => {}
      const setters: Array<Record<string, unknown>> = []
      const tweens: Array<Record<string, unknown>> = []
      let tweenKills = 0
      const win = Object.assign(new EventTarget(), {
        innerWidth: 1365,
        innerHeight: 900,
        scrollY: 0,
        performance: { now: () => 100 },
        addCleanup() {},
        matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
        komeiStartup: {
          prepare: () => undefined,
          homeOpen: () => open,
          homeViewport: () => {
            historyReads++
            return history
          },
          onHomeOpen: (listener: () => void) => {
            notifyOpen = listener
            return () => {}
          },
        },
        gsap: {
          defaults() {},
          set: (_target: unknown, vars: Record<string, unknown>) => {
            setters.push(vars)
            return { kill() {} }
          },
          to: (_target: unknown, vars: Record<string, unknown>) => {
            tweens.push(vars)
            return {
              kill() {
                tweenKills++
              },
            }
          },
        },
      })
      runInNewContext(script, {
        window: win,
        document: doc,
        HTMLElement: Card,
        IntersectionObserver: Observer,
        console,
      })
      doc.dispatchEvent(new Event("nav"))
      await new Promise(setImmediate)
      const [viewport, preparation] = observers
      const peek = cards.slice(0, 2).map((target) => ({
        target,
        isIntersecting: true,
        time: 90,
        boundingClientRect: { top: 883, bottom: 1033 },
      }))
      viewport.callback(peek)
      if (preparedWhileCovered) preparation.callback(peek)
      assert.equal(tweens.length, 0, "17px behind the foreground is not a presentation")
      open = true
      history = [{ top: 0, bottom: 900 }] // gone/noteViewport in the same frame
      notifyOpen()
      // Queued pre-open records delivered late cannot consume first disclosure.
      viewport.callback(peek.map((entry) => ({ ...entry, isIntersecting: false })))
      preparation.callback(peek)
      if (preparedWhileCovered) {
        // The owner's y28 can move the 17px peek outside native IO. It must
        // retain its owner until a real later intersection, never finish static.
        viewport.callback(
          peek.map((entry) => ({
            ...entry,
            isIntersecting: false,
            time: 101,
            boundingClientRect: { top: 911, bottom: 1061 },
          })),
        )
        win.scrollY = 40
      }
      const records = peek.map((entry) => ({
        ...entry,
        time: 102,
        boundingClientRect: preparedWhileCovered
          ? { top: 871, bottom: 1021 }
          : entry.boundingClientRect,
      }))
      for (const observer of viewportFirst ? [viewport, preparation] : [preparation, viewport])
        observer.callback(records)
      assert.equal(historyReads, 1, "newly-opened ranges cannot become past history")
      assert.deepEqual(
        setters.map(({ opacity, y }) => [opacity, y]),
        [
          [0.7, 28],
          [0.7, 28],
        ],
      )
      assert.deepEqual(
        tweens.map(({ duration, delay }) => [duration, delay]),
        [
          [0.62, 0],
          [0.62, 0.06],
        ],
      )
      tweens.forEach(({ onComplete }) => (onComplete as () => void)())
      viewport.callback(records)
      preparation.callback(records)
      assert.equal(setters.length, 2, "actually presented cards cannot be hidden again")
      assert.equal(tweens.length, 2, "completed cards cannot replay")
      // An unseen photo starts beyond the viewport AND its 160px preparation
      // band. One 260px scroll skips the band; either native callback may win.
      const offscreen = [
        {
          target: cards[2],
          isIntersecting: false,
          time: 103,
          boundingClientRect: { top: 1100, bottom: 1250 },
        },
      ]
      viewport.callback(offscreen)
      preparation.callback(offscreen)
      assert.equal(setters.length, 2, "offscreen observations must not consume unseen eligibility")
      win.scrollY += 260
      const photo = [
        {
          target: cards[2],
          isIntersecting: true,
          time: 104,
          boundingClientRect: { top: 840, bottom: 990 },
        },
      ]
      for (const observer of viewportFirst ? [viewport, preparation] : [preparation, viewport])
        observer.callback(photo)
      assert.equal(
        tweens.length,
        3,
        "the first 260px photo exposure must animate, not finish static",
      )
      assert.equal(tweens[2].duration, 0.62)
      assert.deepEqual([setters[2].opacity, setters[2].y], [0.7, 28])
      const killsBeforeExit = tweenKills
      viewport.callback(offscreen.map((entry) => ({ ...entry, time: 105 })))
      assert.equal(
        tweenKills,
        killsBeforeExit,
        "leaving the viewport must not kill an active tween",
      )
      ;(tweens[2].onComplete as () => void)()
      viewport.callback(photo)
      preparation.callback(photo)
      assert.equal(setters.length, 3, "a completed photo cannot be hidden again")
      assert.equal(tweens.length, 3, "a completed photo cannot replay")
    }
  }
})

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
    const profile = await mkdtemp(join("/var/tmp", "startup-regression-"))
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
        .komei-post-card{top:883px}.komei-category-card{top:1400px}.komei-module-card{top:2500px}
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
      await browser("set", "viewport", "1365", "900")
      await browser("open", `http://127.0.0.1:${port}/`)
      assert.equal(
        await evaluate("window.__pausedHero"),
        true,
        "exercise actual paused Hero owners",
      )
      await browser(
        "wait",
        "--fn",
        "document.documentElement.dataset.komeiPrelude==='playing'&&document.querySelector('.komei-post-card').style.opacity==='0.7'",
      )
      assert.equal(
        await evaluate("window.komeiStartup.homeOpen()"),
        false,
        "covered native intersections must not consume first-screen disclosure",
      )
      assert.deepEqual(
        await evaluate(
          "[innerWidth,innerHeight,Math.round(document.querySelector('.komei-post-card').getBoundingClientRect().top-28)]",
        ),
        [1365, 900, 883],
        "the first row has a 17px untransformed peek, not a fully visible fixture card",
      )
      await browser("wait", "--fn", "window.komeiStartup.homeOpen()")
      await browser("scroll", "down", "40")
      await browser(
        "wait",
        "--fn",
        "!!(window.__firstCard=gsap.getTweensOf(document.querySelector('.komei-post-card')).find(t=>t.duration()>0))",
      )
      assert.equal(await evaluate("__firstCard.duration()"), 0.62)
      assert.equal(
        await evaluate("!!document.documentElement.dataset.komeiHomeDevelop"),
        true,
        "the original Hero started at handoff, before foreground gone",
      )
      await browser("press", "Escape")
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
