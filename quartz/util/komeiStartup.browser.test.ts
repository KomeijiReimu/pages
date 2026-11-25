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
import { komeiTheme } from "../komeiTheme.config"
import { startupStyle } from "./komeiStartup"
import { joinStyles } from "./theme"

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
    style = { setProperty() {}, removeProperty() {} }
    contains() {
      return false
    }
    setAttribute(name: string) {
      this.attrs.add(name)
      if (name === "data-komei-home-reveal") this.starts++
    }
    removeAttribute(name: string) {
      this.attrs.delete(name)
    }
    closest(selector: string) {
      return selector === "[data-komei-post-timeline-scroll]" ? null : this
    }
  }
  const [seen, fresh, focused, clipped] = Array.from({ length: 4 }, () => new Card())
  const cards = [seen, fresh, focused, clipped]
  type Entry = {
    target: Card
    isIntersecting: boolean
    intersectionRatio: number
    boundingClientRect: {
      top: number
      bottom: number
      left: number
      right: number
      width: number
      height: number
    }
  }
  let deliver: (entries: Entry[]) => void = () => assert.fail("missing observer")
  let disconnects = 0,
    requests = 0
  let emptyLibrary: { onload: () => void } | undefined
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
      appendChild(script: { onload: () => void }) {
        requests++
        emptyLibrary = script
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
    komeiStartup: {
      prepare() {},
      homeViewport: () => [
        { top: 0, bottom: 900 },
        { top: 2400, bottom: 3300 },
      ],
    },
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
        intersectionRatio: isIntersecting ? 0.5 : 0,
        boundingClientRect: {
          top,
          bottom: top + 150,
          left,
          right: left + 100,
          width: 100,
          height: 150,
        },
      },
    ])
  send(seen, 2500, false)
  send(seen, 400, true)
  assert.equal(
    seen.starts,
    0,
    "deep restored viewport stays readable even before the router scrolls there",
  )
  send(clipped, 500, false, 2000)
  send(clipped, 500, true)
  assert.equal(clipped.starts, 1, "offscreen in the horizontal rail was not a prior disclosure")
  emptyLibrary!.onload()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(disconnects, 0, "empty GSAP script must not disable native IO")
  send(fresh, 1100, false)
  send(focused, 1150, false)
  assert.equal(fresh.starts, 0)
  assert.ok(fresh.attrs.has("data-komei-home-pending"), "the first pose is set offscreen")
  listeners.get("focusin")!({ target: focused })
  assert.equal(focused.attrs.size, 0, "focus releases even an offscreen pose")
  win.scrollY = 260
  send(fresh, 840, true)
  send(fresh, 840, true)
  send(focused, 890, true)
  assert.equal(
    fresh.starts,
    1,
    "skipping a preparation band still enters once with GSAP unavailable",
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
  "first content is usable before optional CSS/scripts; Chinese typography is stable across routes",
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
    const css = joinStyles(komeiTheme, styles.outputFiles[0].text)
    assert.equal(komeiTheme.fontOrigin, "local")
    assert.doesNotMatch(css, /@font-face|@import\b|fonts\.googleapis|\/fonts\.css|LXGW/i)
    const samples = `<div class="page"><span class="komei-site-header__title">图书馆</span><nav class="komei-top-nav__links"><a href="#one">归档</a></nav></div><article><p id="sample-body">正文与标点。</p><code id="sample-code">const 中文 = 1</code></article>`
    const hero = `<section class="komei-home-hero komei-home-hero--editorial"><span class="komei-home-hero__backdrop" aria-hidden="true"></span><div class="komei-home-hero__copy"><h1 id="komei-home-title"><span>中文标题<svg class="komei-home-hero__signature komei-home-hero__sheet" aria-hidden="true" style="--wide-route:path('M0 0Q10 5 20 5');--wide-turn:path('M0 0Q12 5 20 5')"><path id="ink" class="komei-home-hero__heartline" d="M0 0Q10 5 20 5" pathLength="100" stroke-dasharray="5.00994 101" stroke-dashoffset="-94.99006"/></svg></span></h1>
      <div class="komei-home-hero__actions"><a class="komei-button komei-button--primary" href="#one">阅读文章</a><a class="komei-button" href="#two">浏览归档</a></div></div></section>`
    const inkState = `(() => [...document.querySelector('.komei-home-hero').getAnimations({subtree:true})].map(a=>[a.effect.target.id,a.playState,a.effect.getTiming().duration]))()`
    const font = `["h1",".komei-site-header__title",".komei-top-nav__links a","#sample-body","#sample-code"].map(s=>getComputedStyle(document.querySelector(s)).fontFamily)`
    const library = Promise.withResolvers<void>()
    const afterFcp = Promise.withResolvers<void>()
    const server = createServer((req, res) => {
      if (req.url === "/painted") {
        afterFcp.resolve()
        res.writeHead(204).end()
        return
      }
      if (req.url === "/optional-theme.css") {
        res.setHeader("Content-Type", "text/css")
        void afterFcp.promise.then(() => res.end(".article-title { --theme-ready: yes; }"))
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
      res.end(`<!doctype html><html lang="zh-CN"><head><style>${startupStyle}</style><script data-startup-slug="index">${bootstrap}</script>
      ${req.url === "/" ? '<link id="optional-theme" rel="stylesheet" media="print" data-komei-home-style="" href="/optional-theme.css">' : ""}
      <style>${css}
      body{margin:0;min-height:4500px} html{scroll-behavior:auto} .fixture-item{position:absolute;height:150px;width:260px;left:0;margin:0}
      #rail{position:absolute;top:3900px;width:210px;overflow:auto;display:flex;gap:10px}
      #rail > article{box-sizing:border-box;flex:0 0 210px;height:150px}
      #group,#other{position:absolute;top:1450px;display:flex} #group > div,#other > div{width:90px;height:80px}
      #music .komei-music-player__cover img{animation-duration:700ms!important}
      </style></head><body data-slug="index"><div id="quartz-root">
      ${hero}${samples}
      <article id="seen" class="fixture-item komei-post-card" style="top:750px">Initially readable</article>
      <article id="sliver" class="fixture-item komei-post-card" style="top:883px"><div class="komei-post-card__body">Initially only 17px</div></article>
      <a id="focus" class="fixture-item komei-category-card" style="top:1150px" href="#one">Focus me</a>
      <figure id="photo" class="fixture-item komei-home-gallery-masonry" style="top:1600px"><span class="komei-home-gallery-masonry__shell"><img width="180" height="120" alt="Unseen photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></span></figure>
      <div id="group">${[1, 2, 3, 4].map((i) => `<div id="g${i}" class="komei-category-card"><a href="#one">Group ${i}</a></div>`).join("")}</div>
      <div id="other"><div id="independent" class="komei-category-card"><span>Other group</span></div></div>
      <div id="music" class="fixture-item komei-module-card komei-module-card--music" style="top:1500px"><header id="musicHead" class="komei-module-card__header">Music</header><div class="komei-music-player__cover"><img id="musicCover" alt="Cover" width="40" height="40"></div></div>
      <div class="komei-music-player"><button data-komei-music-play>Music</button></div>
      <article id="card" class="fixture-item komei-module-card" style="top:2800px"><a href="#one">Unseen card</a></article>
      <article id="restored" class="fixture-item komei-post-card" style="top:3450px">Restored viewport</article>
      <div id="rail" data-komei-post-timeline-scroll>${[0, 1, 2, 3, 4].map((i) => `<article id="r${i}" class="komei-post-card"><div class="komei-post-card__body">Rail ${i}</div></article>`).join("")}</div></div>
      <script>window.addCleanup=()=>{};window.starts=[];document.addEventListener('animationstart',e=>{const id=e.target.id||e.target.closest('[data-komei-home-reveal]')?.id;starts.push([id,e.animationName]);if(['card','r3'].includes(id))e.target.getAnimations().forEach(a=>a.pause())});
      window.enters={};const attr='data-komei-home-reveal';new MutationObserver(ms=>{for(const {target:e} of ms)if(e.hasAttribute(attr)){
        (enters[e.id]??=[]).push([e.getAttribute(attr),e.style.getPropertyValue('--komei-enter-delay')]);
        if(e.id==='g2')e.querySelector('a').focus({preventScroll:true});
      }}).observe(document.body,{attributes:true,attributeFilter:[attr],subtree:true});
      document.addEventListener('animationend',e=>{if(e.target.id==='musicHead')requestAnimationFrame(()=>window.siblingKept=document.querySelector('#music').hasAttribute(attr))});
      window.frames=async(n=3)=>{while(n--)await new Promise(requestAnimationFrame);return true};
      new PerformanceObserver((list,observer)=>{if(list.getEntriesByName('first-contentful-paint').length){observer.disconnect();fetch('/painted')}}).observe({type:'paint',buffered:true});
      requestAnimationFrame(()=>{window.firstFrame=${visible};window.firstInk=${inkState};window.initialFonts=${font}});
      new MutationObserver((_,observer)=>{if(!document.documentElement.hasAttribute('data-ink-prepaint')){window.releasedInk=${inkState};observer.disconnect()}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-ink-prepaint']});
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
      assert.deepEqual(
        await evaluate(
          "['#sliver > div','#photo img','#card > a'].map(s=>getComputedStyle(document.querySelector(s)).opacity)",
        ),
        ["1", "1", "1"],
        "offscreen copies and photos are printed normally without JS",
      )
      assert.equal(
        await evaluate(
          "!!window.komeiStartup || !!document.querySelector('[data-komei-home-signature],[data-ink-prepaint]')",
        ),
        false,
      )
      assert.deepEqual(await evaluate(inkState), [], "without JS the pen rests")
      await browser("open", url)
      await browser("wait", "--fn", "!!window.firstFrame")
      assert.deepEqual(await evaluate("window.firstFrame"), [true, true, true])
      assert.deepEqual(await evaluate("window.firstInk"), [["ink", "paused", 1520]])
      await browser("wait", "--fn", "!!window.releasedInk")
      assert.deepEqual(await evaluate("window.releasedInk"), [["ink", "running", 1520]])
      assert.ok(
        await evaluate(
          `(()=>{const css=performance.getEntriesByName(location.origin+'/optional-theme.css')[0];return css.renderBlockingStatus==='non-blocking' && css.responseEnd>=performance.getEntriesByName('first-contentful-paint')[0].startTime && document.querySelector('#optional-theme').media==='all'})()`,
        ),
        "screen paints while optional CSS is withheld, then applies the loaded sheet",
      )
      assert.ok(
        await evaluate("document.documentElement.hasAttribute('data-komei-home-signature')"),
      )
      const initialFonts: string[] = await evaluate("window.initialFonts")
      const [heading, brand, nav, body, code] = initialFonts
      assert.match(heading, /SimSun.*\bserif$/)
      assert.equal(brand, heading)
      assert.match(nav, /Microsoft YaHei.*\bsans-serif\b/)
      assert.equal(body, nav)
      assert.match(code, /\bmonospace$/)
      assert.deepEqual(await evaluate(font), initialFonts)
      await evaluate("document.querySelector('#focus').focus({preventScroll:true});attach()")
      await evaluate("frames()")
      assert.deepEqual(await evaluate("Object.keys(enters)"), [], "already-visible ink stays still")
      await evaluate("scrollTo(0,20);frames()")
      assert.equal(
        await evaluate("!!enters.sliver"),
        false,
        "an initially visible sliver never backs up to take a starting pose",
      )
      await evaluate("scrollTo(0,65);frames()")
      assert.equal(await evaluate("!!enters.sliver"), false)
      await evaluate("scrollTo(0,800);true")
      await browser(
        "wait",
        "--fn",
        "starts.some(([id,n])=>id==='photo' && n==='komei-enter-library-print')",
      )
      await browser(
        "wait",
        "--fn",
        "!document.querySelector('#photo').hasAttribute('data-komei-home-reveal')",
      )
      assert.deepEqual(
        await evaluate("['g1','g2','g3','g4','independent'].map(id=>enters[id])"),
        ["0ms", "32ms", "64ms", "64ms", "0ms"].map((ms) => [["", ms]]),
      )
      await browser("wait", "--fn", "window.siblingKept!==undefined")
      assert.deepEqual(
        await evaluate(
          "[starts.some(([id])=>id==='g2'),document.querySelector('#g2').style.getPropertyValue('--komei-enter-delay')]",
        ),
        [false, ""],
        "focus during the delay cancels the pending entry",
      )
      assert.equal(
        await evaluate("siblingKept"),
        true,
        "the first child's animationend must leave its sibling playing",
      )
      await browser(
        "wait",
        "--fn",
        "!document.querySelector('#music').hasAttribute('data-komei-home-reveal')",
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
      await browser(
        "wait",
        "--fn",
        "starts.some(([id,n])=>id==='card' && n==='komei-enter-library-print')",
      )
      assert.ok(
        await evaluate("document.querySelector('#card').hasAttribute('data-komei-home-reveal')"),
        "cleanup exercises a live CSS animation",
      )
      assert.deepEqual(
        await evaluate(`(()=>{const card=document.querySelector('#card'), ink=card.firstElementChild;
          const a=ink.getAnimations()[0]; a.currentTime=0;
          return [card.getBoundingClientRect().top+scrollY,getComputedStyle(card).translate,getComputedStyle(ink).translate]})()`),
        [2800, "none", "0px 14px"],
        "only the ink lifts, never the observer or link's outer card",
      )
      assert.equal(
        await evaluate(
          `starts.filter(([id])=>id==='photo').length===1 && !starts.some(([id])=>id==='seen'||id==='focus')`,
        ),
        true,
      )
      await evaluate(
        "document.querySelector('[data-komei-music-play]').focus({preventScroll:true});true",
      )
      await browser("press", "Tab")
      assert.deepEqual(
        await evaluate(
          "[document.activeElement.closest('article')?.id,document.querySelector('#card').hasAttribute(attr),document.querySelector('#card').style.getPropertyValue('--komei-enter-delay')]",
        ),
        ["card", false, ""],
      )
      assert.equal(
        await evaluate("starts.filter(([id])=>id==='g2').length"),
        0,
        "blur cannot replay a skipped entry",
      )
      await evaluate("document.querySelector('#rail').scrollLeft=440;true")
      assert.equal(
        await evaluate(
          `(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));scrollTo(0,3000);dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return !document.querySelector('[data-komei-home-reveal],[data-komei-home-pending],[data-komei-home-signature]')})()`,
        ),
        true,
      )
      await evaluate("frames()")
      assert.equal(
        await evaluate("!!enters.restored"),
        false,
        "deep pageshow viewport stays static",
      )
      await evaluate(
        "document.dispatchEvent(new Event('prenav'));location.hash='rail';scrollTo(0,3350);frames()",
      )
      assert.deepEqual(
        await evaluate("enters.r2"),
        [["", "0ms"]],
        "vertical arrival at an offset rail, after hash-only prenav and persisted pageshow",
      )
      await evaluate("document.querySelector('#rail').scrollLeft=220;frames()")
      assert.deepEqual(
        await evaluate("enters.r1"),
        [["left", "0ms"]],
        "first horizontal move can be backwards",
      )
      await evaluate("document.querySelector('#rail').scrollLeft=660;frames()")
      assert.deepEqual(await evaluate("enters.r3"), [["right", "0ms"]])
      assert.deepEqual(
        await evaluate(`(()=>{const card=document.querySelector('#r3'), ink=card.querySelector('.komei-post-card__body');
          const a=ink.getAnimations()[0]; a.currentTime=0;
          return [getComputedStyle(card).translate,getComputedStyle(ink).translate]})()`),
        ["none", "14px"],
        "a real sideways arrival moves its text along x only",
      )
      await evaluate("document.querySelector('#rail').scrollLeft=440;frames()")
      assert.equal(
        await evaluate("enters.r2.length"),
        1,
        "returning to a seen card never replays it",
      )
      assert.equal(await evaluate("document.querySelector('#r3').hasAttribute(attr)"), true)
      await browser("set", "media", "light", "reduced-motion")
      await evaluate("document.querySelector('#rail').scrollLeft=880;frames()")
      assert.equal(
        await evaluate(
          "!!enters.r4 || !!document.querySelector('[data-komei-home-reveal],[data-komei-home-pending],[style*=\"--komei-enter-delay\"]')",
        ),
        false,
        "switching to reduced motion cleans an active entry and disables unseen ones",
      )
      assert.ok(
        await evaluate(
          `(()=>{document.dispatchEvent(new Event('prenav'));document.body.dataset.slug='notes/sample';document.body.innerHTML=${JSON.stringify(`<h1 class="article-title">阅读笔记</h1>${samples}`)};document.dispatchEvent(new Event('nav'));return getComputedStyle(document.querySelector('.article-title')).getPropertyValue('--theme-ready').trim()==='yes'})()`,
        ),
        "the activated theme styles newly committed article content",
      )
      assert.deepEqual(await evaluate(font), initialFonts, "article keeps heading/UI/code roles")
      await browser("set", "media", "light")
      assert.deepEqual(
        await evaluate(
          `document.dispatchEvent(new Event('prenav'));history.replaceState(null,'','/');document.body.dataset.slug='index';document.body.innerHTML=${JSON.stringify(hero + samples)};document.dispatchEvent(new CustomEvent('nav',{detail:{navigation:{source:'link',from:'notes/sample'}}}));${inkState}`,
        ),
        [["ink", "running", 920]],
        "SPA return animates only the single stroke, with no cold paint gate",
      )
      assert.deepEqual(await evaluate(font), initialFonts, "SPA and direct home agree")
      assert.equal(await evaluate("document.fonts.size"), 0, "no web faces registered")
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
