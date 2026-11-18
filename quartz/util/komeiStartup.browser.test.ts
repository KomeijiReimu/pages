import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { runInNewContext } from "node:vm"
import { build } from "esbuild"
import { sassPlugin } from "esbuild-sass-plugin"
import { startupStyle } from "./komeiStartup"

const compile = async (file: string) =>
  (await build({ entryPoints: [file], bundle: true, write: false, format: "iife" })).outputFiles[0]
    .text

// Deterministic native-record delivery, not a substitute for layout or paint.
// The route only sees the outcome (which cards get an entry), not a GSAP clock.
test("seen geometry, focus and route cleanup win over late or duplicate IO; reading routes do not request GSAP", async () => {
  const script = await compile("quartz/components/scripts/komeiAnimations.inline.ts")
  class Card {
    attrs = new Set<string>()
    starts = 0
    setAttribute(name: string) {
      this.attrs.add(name)
      this.starts++
    }
    removeAttribute(name: string) {
      this.attrs.delete(name)
    }
    closest() {
      return this
    }
  }
  const [seen, fresh, focused, clipped] = Array.from({ length: 4 }, () => new Card())
  const cards = [seen, fresh, focused, clipped]
  type Entry = {
    target: Card
    isIntersecting: boolean
    boundingClientRect: { top: number; bottom: number; left: number; right: number }
  }
  let deliver: (entries: Entry[]) => void = () => assert.fail("missing observer")
  let disconnects = 0,
    requests = 0
  class Observer {
    constructor(callback: (entries: Entry[]) => void) {
      deliver = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {
      disconnects++
    }
  }
  const container = {},
    listeners = new Map<string, (event: { target: Card }) => void>()
  const doc = Object.assign(new EventTarget(), {
    documentElement: { getAttribute: () => null, setAttribute() {} },
    body: { dataset: { slug: "notes/sample" } },
    querySelector: (selector: string) => (selector === "#quartz-root" ? container : null),
    querySelectorAll: () => cards,
    createElement: () => ({ dataset: {} }),
    head: {
      appendChild() {
        requests++
      },
    },
  })
  const add = doc.addEventListener.bind(doc)
  doc.addEventListener = (name, fn, options) => {
    if (name === "focusin") listeners.set(name, fn as unknown as (event: { target: Card }) => void)
    else add(name, fn, options)
  }
  const win = Object.assign(new EventTarget(), {
    innerHeight: 900,
    innerWidth: 1365,
    scrollY: 0,
    addCleanup() {},
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    komeiStartup: { prepare() {}, homeViewport: () => [{ top: 0, bottom: 900 }] },
  })
  runInNewContext(script, {
    window: win,
    document: doc,
    Element: Card,
    HTMLElement: Card,
    IntersectionObserver: Observer,
    console,
  })
  doc.dispatchEvent(new Event("nav"))
  assert.equal(requests, 0)
  doc.body.dataset.slug = "index"
  doc.dispatchEvent(new Event("nav"))
  const send = (target: Card, top: number, isIntersecting: boolean, left = 0) =>
    deliver([
      {
        target,
        isIntersecting,
        boundingClientRect: { top, bottom: top + 150, left, right: left + 100 },
      },
    ])
  send(seen, 883, true)
  assert.equal(seen.starts, 0, "17px already visible cannot be taken back")
  send(clipped, 883, false, 2000)
  send(clipped, 883, true)
  assert.equal(clipped.starts, 1, "offscreen in the horizontal rail was not a prior disclosure")
  send(fresh, 1100, false)
  send(focused, 1150, false)
  assert.equal(fresh.starts, 0)
  listeners.get("focusin")!({ target: focused })
  win.scrollY = 260
  send(fresh, 840, true)
  send(fresh, 840, true)
  send(focused, 890, true)
  assert.equal(
    fresh.starts,
    1,
    "skipping a preparation band still enters once with GSAP unresolved",
  )
  assert.equal(focused.starts, 0, "focus must remain static")
  assert.ok(fresh.attrs.has("data-komei-home-reveal"))
  win.dispatchEvent(new Event("pagehide"))
  assert.equal(disconnects, 1)
  assert.equal(fresh.attrs.size + clipped.attrs.size, 0)
  send(fresh, 840, true)
  assert.equal(fresh.starts, 1)
})

// A public synthetic document: production startup CSS, home styles and scripts,
// real layout/IO/fonts. No generated site or personal content is needed.
test(
  "first content frame is readable and hit-testable; late fonts/scripts cannot replay it",
  { skip: process.env.STARTUP_FIXTURE_PROBE !== "1", timeout: 90_000 },
  async () => {
    const [bootstrap, animations, gsap, styles] = await Promise.all([
      compile("quartz/components/scripts/komeiStartup.inline.ts"),
      compile("quartz/components/scripts/komeiAnimations.inline.ts"),
      readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"), "utf8"),
      build({
        entryPoints: ["quartz/styles/custom.scss"],
        plugins: [sassPlugin()],
        bundle: true,
        write: false,
        external: ["*.svg", "*.woff2", "*.png"],
      }),
    ])
    const profile = await mkdtemp(join("/var/tmp", "startup-regression-"))
    const browser = async (...args: string[]) =>
      (
        await promisify(execFile)(
          "agent-browser",
          ["--session", basename(profile), "--profile", join(profile, "browser"), ...args],
          { timeout: 15_000, env: { ...process.env, TMPDIR: profile } },
        )
      ).stdout
    const evaluate = async (script: string) => JSON.parse(await browser("eval", script))
    const visible = `(() => {
    const title = document.querySelector('h1'), links = [...document.querySelectorAll('.komei-home-hero__actions a')];
    const readable = e => e.checkVisibility({opacityProperty:true,visibilityProperty:true}) && getComputedStyle(e).opacity === '1';
    return [readable(title),links.length===2 && links.every(e=>{const b=e.getBoundingClientRect(); return readable(e) && b.width>0 && b.height>0 && e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}),!document.querySelector('.komei-lightleaf,[data-komei-veil],[data-komei-entry]')];
  })()`
    const font = `[...document.querySelectorAll('h1,.komei-home-hero__actions a')].map(e=>getComputedStyle(e).fontFamily)`
    const library = Promise.withResolvers<void>()
    const afterFcp = Promise.withResolvers<void>()
    const server = createServer((req, res) => {
      if (req.url === "/painted") {
        afterFcp.resolve()
        res.writeHead(204).end()
        return
      }
      if (req.url === "/slow-katex.css") {
        res.setHeader("Content-Type", "text/css")
        void afterFcp.promise.then(() => res.end(".katex { --formula-ready: yes; }"))
        return
      }
      if (req.url === "/static/vendor/gsap.min.js") {
        res.setHeader("Content-Type", "text/javascript")
        void library.promise.then(() => res.end(gsap))
        return
      }
      if (req.url === "/animations.js") {
        res.setHeader("Content-Type", "text/javascript")
        res.end(animations)
        return
      }
      if (req.url !== "/" && req.url !== "/static") {
        res.writeHead(404)
        res.end()
        return
      }
      if (req.url === "/static") res.setHeader("Content-Security-Policy", "script-src 'none'")
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(`<!doctype html><html><head><style>${startupStyle}</style><script data-startup-slug="index">${bootstrap}</script>
      ${req.url === "/" ? '<link id="formula-sheet" rel="stylesheet" media="print" data-komei-home-style="" data-persist="true" href="/slow-katex.css">' : ""}
      <style>${styles.outputFiles[0].text}
      :root{--headerFont:FixtureLate,serif;--bodyFont:FixtureLate,sans-serif;--titleFont:FixtureLate,serif}
      body{margin:0;min-height:4500px} html{scroll-behavior:auto} .fixture-item{position:absolute;height:150px;width:260px;left:0;margin:0}
      </style></head><body data-slug="index"><div id="quartz-root">
      <section class="komei-home-hero komei-home-hero--editorial"><div class="komei-home-hero__copy"><h1 id="komei-home-title"><span>Public title<svg class="komei-home-hero__signature" aria-hidden="true"><path d="M0 0L5 5"/></svg></span></h1>
      <div class="komei-home-hero__actions"><a class="komei-button" href="#one">First entry</a><a class="komei-button" href="#two">Second entry</a></div></div></section>
      <article id="seen" class="fixture-item komei-post-card" style="top:883px">Initially exposed</article>
      <a id="focus" class="fixture-item komei-category-card" style="top:1150px" href="#one">Focus me</a>
      <figure id="photo" class="fixture-item komei-home-gallery-masonry" style="top:1600px">Unseen photo</figure>
      <div class="komei-music-player"><button data-komei-music-play>Music</button></div>
      <article id="card" class="fixture-item komei-module-card" style="top:2800px">Unseen card</article></div>
      <script>window.addCleanup=()=>{};window.starts=[];document.addEventListener('animationstart',e=>{starts.push([e.target.id,e.animationName]);if(e.target.id==='card')e.target.getAnimations().forEach(a=>a.pause())});
      new PerformanceObserver((list,observer)=>{if(list.getEntriesByName('first-contentful-paint').length){observer.disconnect();fetch('/painted')}}).observe({type:'paint',buffered:true});
      requestAnimationFrame(()=>{window.firstFrame=${visible};window.initialFonts=${font}});
      window.attach=()=>new Promise(r=>{const s=document.createElement('script');s.src='/animations.js';s.onload=()=>{document.dispatchEvent(new Event('nav'));r(true)};document.head.append(s)})</script></body></html>`)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      await browser("open", "about:blank")
      await browser("set", "viewport", "1365", "900")
      await browser("open", `${url}/static`)
      assert.deepEqual(
        await evaluate(visible),
        [true, true, true],
        "no scripts: both real anchors work",
      )
      assert.equal(
        await evaluate(
          "!!window.komeiStartup || document.documentElement.hasAttribute('data-komei-home-signature')",
        ),
        false,
      )
      await browser("open", url)
      await browser("wait", "--fn", "!!window.firstFrame")
      assert.deepEqual(await evaluate("window.firstFrame"), [true, true, true])
      assert.ok(
        await evaluate(
          `(()=>{const css=performance.getEntriesByName(location.origin+'/slow-katex.css')[0];return css.renderBlockingStatus==='non-blocking' && css.responseEnd>=performance.getEntriesByName('first-contentful-paint')[0].startTime && document.querySelector('#formula-sheet').media==='all'})()`,
        ),
        "screen paints while optional CSS is withheld, then applies the loaded sheet",
      )
      assert.ok(
        await evaluate("document.documentElement.hasAttribute('data-komei-home-signature')"),
      )
      assert.equal(
        await evaluate(
          `(async()=>{const face=new FontFace('FixtureLate','local("Arial"),local("Liberation Sans"),local("DejaVu Sans")');document.fonts.add(face);await face.load();return face.status==='loaded' && initialFonts.every(f=>!f.includes('FixtureLate')) && JSON.stringify(initialFonts)===JSON.stringify(${font})})()`,
        ),
        true,
      )
      await evaluate("attach()")
      await evaluate(
        "document.querySelector('#focus').focus({preventScroll:true});scrollTo(0,800);true",
      )
      await browser(
        "wait",
        "--fn",
        "starts.some(([id,n])=>id==='photo' && n==='komei-enter-photo')",
      )
      await browser(
        "wait",
        "--fn",
        "!document.querySelector('#photo').hasAttribute('data-komei-home-reveal')",
      )
      await evaluate("scrollTo(0,0);true")
      await browser("wait", "--fn", "scrollY===0")
      library.resolve()
      await browser("wait", "--fn", "!!window.gsap")
      assert.deepEqual(
        await evaluate(visible),
        [true, true, true],
        "late scripts and scroll leave hero readable",
      )
      await evaluate("scrollTo(0,800);true")
      await browser(
        "wait",
        "--fn",
        "document.querySelector('#photo').getBoundingClientRect().top < innerHeight",
      )
      await evaluate("scrollTo(0,2100);true")
      await browser("wait", "--fn", "starts.some(([id,n])=>id==='card' && n==='komei-enter-card')")
      assert.ok(
        await evaluate("document.querySelector('#card').hasAttribute('data-komei-home-reveal')"),
        "cleanup exercises a live CSS animation",
      )
      assert.equal(
        await evaluate(
          `starts.filter(([id])=>id==='photo').length===1 && !starts.some(([id])=>id==='seen'||id==='focus')`,
        ),
        true,
      )
      assert.equal(
        await evaluate(
          `(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return !document.querySelector('[data-komei-home-reveal],[data-komei-home-signature]')})()`,
        ),
        true,
      )
      assert.ok(
        await evaluate(
          `(()=>{document.dispatchEvent(new Event('prenav'));document.body.dataset.slug='notes/math';document.body.innerHTML='<span class="katex">x</span>';document.dispatchEvent(new Event('nav'));return document.querySelector('#formula-sheet').hasAttribute('data-persist') && getComputedStyle(document.querySelector('.katex')).getPropertyValue('--formula-ready').trim()==='yes'})()`,
        ),
        "persistent CSS still styles newly committed article content",
      )
    } finally {
      afterFcp.resolve()
      library.resolve()
      try {
        await browser("close")
      } finally {
        server.closeAllConnections()
        if (server.listening) await new Promise<void>((r) => server.close(() => r()))
        await rm(profile, { recursive: true, force: true })
      }
    }
  },
)
