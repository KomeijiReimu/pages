import test from "node:test"
import assert from "node:assert/strict"
import { createServer, get } from "node:http"
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { h } from "preact"
import render from "preact-render-to-string"
import HomeHero from "../components/HomeHero"
import HomeModules from "../components/HomeModules"
import HomeGallery from "../components/HomeGallery"
import PostCards from "../components/PostCards"
import CategoryOverview from "../components/CategoryOverview"
import type { QuartzComponentProps } from "../components/types"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import { build } from "esbuild"
import { startupStyle } from "./komeiStartup"
import { criticalFontStyle, criticalFonts } from "./komeiFonts"
import WebSocket from "ws"

// A bounded PUBLIC fixture probe, not a replacement for real Quartz page/video tests.
// STARTUP_FIXTURE_PROBE=1 bunx tsx --test quartz/util/komeiStartup.browser.test.ts
// Uses only installed tools, an ephemeral loopback port and an isolated session.
const enabled = process.env.STARTUP_FIXTURE_PROBE === "1"
const session = "home-cold-impl-20261018"
async function browser(...args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("agent-browser", ["--session", session, ...args])
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (value) => (stdout += value))
    child.stderr.on("data", (value) => (stderr += value))
    const timer = setTimeout(() => child.kill("SIGKILL"), 25_000)
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`agent-browser ${args[0]} failed (${code}): ${stderr || stdout}`))
    })
  })
}

test(
  "startup: bounded first-frame fault injection on a public fixture",
  {
    skip:
      !enabled ||
      process.env.STARTUP_COLD_PROBE === "1" ||
      process.env.STARTUP_NATIVE_PROBE === "1",
    timeout: 100_000,
  },
  async () => {
    const compile = async (file: string) => {
      const result = await build({
        entryPoints: [file],
        bundle: true,
        write: false,
        // Match Quartz's inline-script loader. The result must parse as a
        // classic Head script despite the bundle's internal TypeScript imports.
        format: "esm",
        platform: "browser",
        minify: true,
      })
      return result.outputFiles[0].text
    }
    const [bootstrap, animations, gsap] = await Promise.all([
      compile("quartz/components/scripts/komeiStartup.inline.ts"),
      compile("quartz/components/scripts/komeiAnimations.inline.ts"),
      readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js")),
    ])
    const requests: Array<{ path: string; scenario: string }> = []
    const profile = await mkdtemp(join(tmpdir(), "home-cold-legacy-"))
    const delays = new Set<ReturnType<typeof setTimeout>>()
    const server = createServer(async (req, res) => {
      try {
        const path = new URL(req.url!, "http://127.0.0.1:8097").pathname
        const scenario = new URL(
          req.headers.referer ?? "http://127.0.0.1/",
          "http://127.0.0.1",
        ).pathname.split("/")[1]
        requests.push({ path, scenario })
        res.setHeader("Cache-Control", "no-store")
        if (path === "/fixture-hero.svg") {
          if (scenario === "imageblocked") {
            res.writeHead(503).end()
            return
          }
          res.setHeader("Content-Type", "image/svg+xml")
          const image =
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#6a8a9b"/></svg>'
          if (scenario === "imageslow") {
            const timer = setTimeout(() => {
              delays.delete(timer)
              res.end(image)
            }, 4500)
            delays.add(timer)
          } else res.end(image)
          return
        }
        if (path === "/static/vendor/gsap.min.js") {
          if (scenario === "blocked") {
            res.writeHead(503).end()
            return
          }
          res.setHeader("Content-Type", "application/javascript")
          if (scenario === "late") {
            const timer = setTimeout(() => {
              delays.delete(timer)
              res.end(gsap)
            }, 4500)
            delays.add(timer)
          } else res.end(gsap)
          return
        }
        if (path.startsWith("/static/fonts/startup/")) {
          const file = path.split("/").at(-1)!
          if (scenario === "fontblocked") {
            res.writeHead(503).end()
            return
          }
          if (!criticalFonts.some((font) => font.file === file)) {
            res.writeHead(404).end()
            return
          }
          res.setHeader("Content-Type", "font/woff2")
          if (scenario === "fontwarm")
            res.setHeader("Cache-Control", "public, max-age=3600, immutable")
          const bytes = await readFile(new URL(`../static/fonts/startup/${file}`, import.meta.url))
          if (scenario === "fontslow") {
            const timer = setTimeout(() => {
              delays.delete(timer)
              res.end(bytes)
            }, 4500)
            delays.add(timer)
          } else res.end(bytes)
          return
        }
        const name = path.split("/")[1]
        const slug = name === "note" ? "notes/public-fixture" : "index"
        const active = name !== "appblocked"
        const duration = ["late", "fontslow", "imageslow"].includes(name) ? 5400 : 1800
        const sampler = `window.__frames=[]; window.__done=false;
        function sample(t) {
          const title=document.querySelector('h1'), profile=document.querySelector('.komei-profile-card'), brand=document.querySelector('.brand'), backdrop=document.querySelector('.komei-home-hero__backdrop');
          if(title && profile && brand) {
            const s=getComputedStyle(title), p=getComputedStyle(profile), b=getComputedStyle(backdrop), r=document.createRange(); r.selectNodeContents(brand);
            window.__frames.push({t, a:+s.opacity, v:s.visibility, p:+p.opacity, pv:p.visibility, b:+b.opacity, bv:b.visibility, bt:b.transform, width:r.getBoundingClientRect().width, state:document.documentElement.dataset.komeiStartupState});
          }
          if(t<${duration}) requestAnimationFrame(sample); else window.__done=true;
        } requestAnimationFrame(sample);`
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(`<!doctype html><html><head><meta charset="utf-8">
        ${criticalFonts.map((font) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/static/fonts/startup/${font.file}">`).join("")}
        <style>${criticalFontStyle("")}${startupStyle}
          .brand,h1 {font-family:"Komei UI Serif",serif;font-weight:500;font-size:32px}
          .komei-profile-card {font-family:"Komei UI Sans",sans-serif}
          .komei-home-hero {position:relative;background:#d9e3e8}
          .komei-home-hero__backdrop {position:absolute;inset:0;background:url('/fixture-hero.svg') center/cover;pointer-events:none}
          .komei-home-hero > :not(.komei-home-hero__backdrop) {position:relative}
        </style><script>${sampler}</script>
         ${active ? `<script data-startup-slug="${slug}">${bootstrap}</script>` : ""}
         ${name === "preclaimed" ? `<script>${gsap}</script>` : ""}
        </head><body data-slug="${slug}"><div class="komei-background-layer" aria-hidden="true"></div><div id="quartz-root">
        <header><a class="brand">KomeijiReimu的博客</a></header>
        <section class="komei-home-hero"><div class="komei-home-hero__backdrop" aria-hidden="true"></div><div class="komei-home-hero__eyebrow">不动的大图书馆</div>
        <h1>相信的心就是你的魔法</h1><div class="komei-home-hero__actions"><a>阅读最新文章</a></div>
        <aside class="komei-profile-card">KomeijiReimu @brant 知识的幻想乡。</aside></section></div>
        ${active ? `<script>window.addCleanup=()=>{};${animations};document.dispatchEvent(new CustomEvent('nav',{detail:{url:'${slug}'}}));</script>` : ""}
        </body></html>`)
      } catch (error) {
        res.writeHead(500).end(String(error))
      }
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address === "object")
      const origin = `http://127.0.0.1:${address.port}`
      await browser("--profile", profile, "open", "about:blank")
      await browser("set", "viewport", "1440", "900")
      for (const name of [
        "normal",
        "preclaimed",
        "late",
        "blocked",
        "imageblocked",
        "imageslow",
        "fontblocked",
        "fontslow",
        "appblocked",
        "note",
        "fontwarm",
        "fontwarm",
        "reduced",
      ]) {
        if (name === "reduced") await browser("set", "media", "light", "reduced-motion")
        await browser("open", `${origin}/${name}/`)
        await browser("wait", "--fn", "window.__done === true")
        const result = await browser(
          "eval",
          `(() => {
        const frames=window.__frames, visible=f=>f.a>0.01 && f.v!=='hidden' && f.p>0.01 && f.pv!=='hidden';
        const first=frames.findIndex(visible); if(first<0) throw new Error('never readable');
        if(frames[first].t>1600) throw new Error('readability deadline exceeded: '+frames[first].t);
        if(frames.slice(first).some(f=>!visible(f))) throw new Error('visible -> hidden '+JSON.stringify({first:frames[first],hidden:frames.slice(first).filter(f=>!visible(f)).slice(0,4),last:frames.at(-1)}));
        const fcp=performance.getEntriesByType('paint').find(p=>p.name==='first-contentful-paint')?.startTime ?? 0;
        const widths=frames.filter(f=>f.t>fcp+16).map(f=>f.width); if(Math.max(...widths)-Math.min(...widths)>0.15) throw new Error('late font swap: '+JSON.stringify(widths));
        if(document.querySelector('[data-komei-entry]')) throw new Error('pending markers leaked');
        const firstBackdrop=frames.findIndex(f=>f.b>0.001 && f.bv!=='hidden');
        if(firstBackdrop<0 || frames.slice(firstBackdrop).some(f=>f.b<0.001 || f.bv==='hidden')) throw new Error('backdrop re-hidden or never revealed');
        const backdrop=document.querySelector('.komei-home-hero__backdrop');
        if(['transform','opacity','visibility','will-change'].some(p=>backdrop.style.getPropertyValue(p))) throw new Error('backdrop inline state leaked');
        if(getComputedStyle(backdrop).transform!=='none') throw new Error('backdrop scale not restored');
        const global=document.querySelector('.komei-background-layer');
        if(global.hasAttribute('data-komei-entry') || global.getAttribute('style')) throw new Error('global background animated');
         if(${JSON.stringify(name === "preclaimed")}) {
          if(!frames.some(f=>f.b>0 && f.b<0.99 && f.bt!=='none')) throw new Error('illustration fade/scale not observed');
          const firstTitle=frames.findIndex(f=>f.a>0.001 && f.v!=='hidden');
          if(frames[firstTitle].t<=frames[firstBackdrop].t) throw new Error('text did not follow illustration');
        }
        return {scenario:${JSON.stringify(name)},frames:frames.length,firstVisible:frames[first].t,widthRange:[Math.min(...widths),Math.max(...widths)],state:document.documentElement.dataset.komeiStartupState};
      })()`,
        )
        console.log(result.trim())
      }
      assert.ok(requests.some((r) => r.scenario === "late" && r.path.endsWith("gsap.min.js")))
      assert.ok(
        !requests.some(
          (r) =>
            ["note", "reduced", "appblocked"].includes(r.scenario) &&
            r.path.endsWith("gsap.min.js"),
        ),
      )
      assert.equal(
        requests.filter((r) => r.scenario === "fontwarm" && r.path.endsWith(".woff2")).length,
        4,
        "second fontwarm document reuses the four cached assets",
      )
    } finally {
      try {
        await browser("close")
      } finally {
        delays.forEach(clearTimeout)
        server.closeAllConnections()
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          )
        await rm(profile, { recursive: true, force: true })
      }
    }
  },
)

test(
  "startup: real components, independent T0/Hero/route ownership",
  { skip: !enabled || process.env.STARTUP_NATIVE_PROBE === "1", timeout: 150_000 },
  async () => {
    const compile = async (file: string) =>
      (
        await build({
          entryPoints: [file],
          bundle: true,
          write: false,
          format: "esm",
          platform: "browser",
          minify: true,
        })
      ).outputFiles[0].text
    const [bootstrap, animations, gsap] = await Promise.all([
      compile("quartz/components/scripts/komeiStartup.inline.ts"),
      compile("quartz/components/scripts/komeiAnimations.inline.ts"),
      readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"), "utf8"),
    ])
    const props = {
      fileData: { slug: "index" },
      allFiles: [{ slug: "notes/public/fixture", frontmatter: { title: "公开测试", tags: [] } }],
      cfg: { locale: "zh-CN", defaultDateType: "created" },
    } as unknown as QuartzComponentProps
    // Real default Hero/Profile (no invented facts), module and gallery markup.
    const components = [HomeHero(), PostCards(), CategoryOverview(), HomeModules(), HomeGallery()]
    const markup = components.map((Component) => render(h(Component, props))).join("")
    assert.match(markup, /komei-post-card/)
    assert.match(markup, /komei-category-card/)
    assert.match(markup, /komei-home-gallery-season/)
    assert.doesNotMatch(markup, /komei-profile-card__facts/)
    const requests: Array<{ path: string; scenario: string }> = []
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const profile = await mkdtemp(join(tmpdir(), "home-cold-impl-"))
    const server = createServer((req, res) => {
      const path = new URL(req.url!, "http://127.0.0.1").pathname
      const name = path.split("/")[1]
      const scenario = new URL(req.headers.referer ?? "/", "http://127.0.0.1").pathname.split(
        "/",
      )[1]
      requests.push({ path, scenario })
      res.setHeader("Cache-Control", "no-store")
      if (path.endsWith("gsap.min.js")) {
        if (scenario === "blocked") return void res.writeHead(503).end()
        res.setHeader("Content-Type", "application/javascript")
        if (scenario === "late") {
          const timer = setTimeout(() => {
            timers.delete(timer)
            res.end(gsap)
          }, 1500)
          timers.add(timer)
        } else res.end(gsap)
        return
      }
      if (!path.endsWith("/")) return void res.writeHead(204).end()
      const early = name.startsWith("early") || name.startsWith("paused") || name === "modulelate"
      const atomicEarly = early && name !== "modulelate"
      const enabled = !["nojs", "nomodule"].includes(name)
      const slug =
        name === "note"
          ? "notes/public/fixture"
          : name === "post"
            ? "posts/public-fixture"
            : "index"
      const install = `window.__cleanups=[];window.addCleanup=f=>__cleanups.push(f);${animations};document.dispatchEvent(new CustomEvent('nav',{detail:{url:document.body.dataset.slug}}));`
      const probe = `window.__p={frames:[],t0:null,created:[],spec:null,forbidden:0,veilEnds:[]};
       document.addEventListener('animationend',e=>{if(e.target===document.documentElement&&e.pseudoElement==='::before'&&e.animationName==='komei-entry-exit')__p.veilEnds.push({t:performance.now(),elapsed:e.elapsedTime})});
      new MutationObserver(()=>{if(document.documentElement.dataset.komeiVeil==='exiting'&&__p.t0===null)__p.t0=performance.now()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-komei-veil']});
      function sample(t){const hero=document.querySelector('.komei-home-hero'),root=document.documentElement;
        if(hero){const veil=getComputedStyle(root,'::before'),h=getComputedStyle(document.querySelector('h1')),p=getComputedStyle(document.querySelector('.komei-profile-card'));
          __p.frames.push({t,veil:root.dataset.komeiVeil,veilOpacity:veil.content==='none'?0:+veil.opacity,title:+h.opacity,profile:+p.opacity,state:root.dataset.komeiStartupState,y:scrollY});
          if(window.gsap&&gsap.globalTimeline.getChildren(true,true,false).some(t=>t.targets().some(e=>e===document.querySelector('nav')||e===document.querySelector('.komei-background-layer'))))__p.forbidden++;
          if(window.gsap&&!__p.spec){const tl=gsap.globalTimeline.getChildren(false,false,true).find(x=>x.getChildren().some(t=>t.targets().includes(document.querySelector('h1'))));if(tl)__p.spec={total:tl.duration(),children:tl.getChildren().map(t=>({duration:t.vars.duration,stagger:t.vars.stagger}))}}
        }if(t<8000)requestAnimationFrame(sample)}requestAnimationFrame(sample);
      window.__stats=()=>{const nodes=[...document.querySelectorAll('.komei-home-hero,.komei-home-hero__backdrop,.komei-home-hero__eyebrow,.komei-home-hero h1,.komei-home-hero__actions>*,.komei-profile-card,.komei-post-card,.komei-category-card,.komei-module-card,.komei-home-gallery-season,.komei-home-gallery__postcard-card')];
        const ts=window.gsap?gsap.globalTimeline.getChildren(true,true,false).filter(t=>t.targets().some(e=>nodes.includes(e))):[];
        return {state:document.documentElement.dataset.komeiStartupState,veil:document.documentElement.dataset.komeiVeil,pending:document.querySelectorAll('[data-komei-entry]').length,tweens:ts.length,setters:ts.filter(t=>t.duration()===0).length,hidden:nodes.filter(e=>getComputedStyle(e).visibility==='hidden'||+getComputedStyle(e).opacity<.999).length,dirty:nodes.filter(e=>['opacity','visibility','transform','will-change','translate','rotate','scale'].some(p=>e.style.getPropertyValue(p))).length,y:scrollY}};`
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
      :root{--light:#f4f7fa;background:var(--light)}:root[saved-theme=dark]{--light:#121b26;color:white}
      ${startupStyle}body{margin:0}nav{height:60px}.komei-home-hero{height:640px;position:relative;display:flex}.komei-home-hero__copy,.komei-profile-card{width:45%}.komei-home-hero__backdrop{position:absolute;inset:0;background:#c8d3df}
      .komei-post-cards{margin-top:1100px}.komei-category-overview,.komei-home-modules,.komei-home-gallery{margin-top:500px}.komei-post-card,.komei-category-card,.komei-module-card{display:block;min-height:180px;margin:20px}.komei-home-gallery-season,.komei-home-gallery-masonry{width:280px;height:200px}.komei-home-gallery img{max-width:100%;height:160px}.komei-home-gallery__postcard-card{height:200px}svg{width:24px;height:24px}
      </style><script>${probe}</script>${name === "stored" ? `<script>localStorage.setItem('theme','light')</script>` : ""}
      ${name === "armerror" ? `<script>window.__nativeMO=MutationObserver;window.MutationObserver=class{observe(){throw Error('injected Head arm failure')}disconnect(){}};</script>` : ""}
      ${name !== "nojs" ? `<script data-startup-slug="${slug}">${bootstrap}</script>` : ""}
      ${name === "armerror" ? `<script>window.MutationObserver=window.__nativeMO;</script>` : ""}
      ${early ? `<script>${gsap};${name.startsWith("paused") ? "gsap.globalTimeline.pause();" : ""}</script>` : ""}
      ${name === "earlyduplicate" ? `<script>const NativeIO=IntersectionObserver;window.IntersectionObserver=class extends NativeIO{constructor(cb,opts){super((entries,o)=>cb(entries.flatMap(e=>[e,e]),o),opts)}};</script>` : ""}
      ${name === "ioerror" ? `<script>window.IntersectionObserver=class{constructor(){throw Error('injected IO failure')}};</script>` : ""}
      ${name === "noobserver" ? `<script>delete window.IntersectionObserver;</script>` : ""}
      </head><body data-slug="${slug}"><div class="komei-background-layer"></div><div id="quartz-root"><nav><a href="#recent-posts">首页</a></nav>${atomicEarly ? `<script>document.write(${JSON.stringify(markup)});${install}</script>` : markup}</div>
      ${enabled && !atomicEarly ? `<script>${name === "modulelate" ? `setTimeout(()=>{${install}},1600)` : install}</script>` : ""}</body></html>`)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address() as { port: number }
      const origin = `http://127.0.0.1:${address.port}`
      await browser("--profile", profile, "open", "about:blank")
      await browser("set", "viewport", "1440", "900")
      const summaries = []
      const enterCard = async (selector: string) => {
        await browser("eval", `window.__target=document.querySelector(${JSON.stringify(selector)})`)
        const before = +(await browser(
          "eval",
          "__target.getBoundingClientRect().top-innerHeight-100",
        ))
        await browser("scroll", before < 0 ? "up" : "down", String(Math.round(Math.abs(before))))
        await browser("eval", "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        const into = +(await browser("eval", "__target.getBoundingClientRect().top-innerHeight+80"))
        await browser("scroll", into < 0 ? "up" : "down", String(Math.round(Math.abs(into))))
      }
      for (const name of [
        "earlyduplicate",
        "late",
        "modulelate",
        "nomodule",
        "nojs",
        "blocked",
        "armerror",
        "ioerror",
        "noobserver",
        "note",
        "post",
        "pausedwatchdog",
        "pausedtab",
        "pausedpagehide",
        "stored",
        "reduced",
      ]) {
        await browser(
          "set",
          "media",
          name === "stored" ? "dark" : "light",
          name === "reduced" ? "reduced-motion" : "no-preference",
        )
        await browser("open", `${origin}/${name}/`)
        if (name === "pausedtab") await browser("press", "Tab")
        if (name === "modulelate") {
          await browser("scroll", "down", "1800")
          await browser("scroll", "up", "1800")
        }
        if (name === "pausedpagehide")
          await browser("eval", "dispatchEvent(new PageTransitionEvent('pagehide'))")
        await browser(
          "wait",
          "--fn",
          `performance.now()>${name === "pausedwatchdog" ? 3400 : name === "modulelate" || name === "late" ? 1900 : 1350}`,
        )
        const result = JSON.parse(
          await browser(
            "eval",
            `(() => {const p=__p,s=__stats(),fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')?.startTime;return {name:${JSON.stringify(name)},...s,t0:p.t0,veilEnd:p.veilEnds[0],first:p.frames[0],frames:p.frames.length,fcp,spec:p.spec,theme:document.documentElement.getAttribute('saved-theme'),veilSeen:p.frames.some(f=>f.veilOpacity>0),veilClear:p.frames.find(f=>p.t0!==null&&f.t>=p.t0&&f.veilOpacity===0)?.t,postVeilHeroBelowOne:p.frames.some(f=>f.t>(p.t0??0)+260&&(f.title<.999||f.profile<.999)),forbidden:p.forbidden}})()`,
          ),
        )
        summaries.push(result)
        console.log(JSON.stringify(result))
        assert.equal(result.veil, undefined, name)
        assert.equal(result.pending, 0, name)
        assert.equal(result.forbidden, 0, name)
        assert.equal(result.y, 0, name)
        if (result.t0 !== null)
          assert.ok(
            result.veilClear >= result.t0,
            "clear follows the exit; the real animation event, not this marker, measures its duration",
          )
        if (result.veilEnd) {
          assert.equal(result.veilEnd.elapsed, 0.22)
          assert.ok(Math.abs(result.veilClear - result.veilEnd.t) < 80)
        }
        if (name === "earlyduplicate") {
          assert.equal(result.spec.total, 1.1)
          assert.ok(
            result.spec.children.some(
              (t: { duration: number; stagger: number }) =>
                t.duration === 0.72 && t.stagger === 0.07,
            ),
          )
          assert.ok(result.first.t < result.fcp)
          await browser("wait", "--fn", "performance.now()>6400")
          // Each actual card, not its whole section, still gets one real tween
          // after the startup guard has long expired. Duplicate IO entries are injected.
          for (const selector of [
            ".komei-post-card",
            ".komei-category-card",
            ".komei-module-card--music",
            ".komei-home-gallery-season",
            ".komei-home-gallery__postcard-card",
          ]) {
            await enterCard(selector)
            const motion = JSON.parse(
              await browser(
                "eval",
                `(()=>{const ts=gsap.getTweensOf(__target);return {selector:${JSON.stringify(selector)},count:ts.length,duration:ts[0]?.duration(),opacity:+getComputedStyle(__target).opacity,parent:gsap.getTweensOf(__target.parentElement).length}})()`,
              ),
            )
            console.log(JSON.stringify({ routeAfter6s: motion }))
            assert.equal(motion.count, 1, selector)
            assert.equal(motion.duration, 0.62, selector)
            assert.equal(motion.parent, 0, selector)
            assert.ok(motion.opacity >= 0.7 && motion.opacity < 1, selector)
            if (selector === ".komei-module-card--music") {
              await browser("eval", "__target.querySelector('button').focus({preventScroll:true})")
              assert.equal(
                +(await browser("eval", "gsap.getTweensOf(__target).length")),
                0,
                "focus completes only its card",
              )
            }
            if (selector === ".komei-home-gallery__postcard-card") {
              await browser("scroll", "up", "2000")
              await browser("wait", "--fn", "gsap.getTweensOf(__target).length===0")
              const back = +(await browser("eval", "__target.getBoundingClientRect().top-160"))
              await browser("scroll", "down", String(Math.round(back)))
              assert.equal(
                +(await browser("eval", "gsap.getTweensOf(__target).length")),
                0,
                "fast leave/re-entry never replays",
              )
            }
            await browser("wait", "--fn", "gsap.getTweensOf(__target).length===0")
          }
          await browser(
            "eval",
            "document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}))",
          )
          assert.equal(JSON.parse(await browser("eval", "__stats()")).dirty, 0)
        } else if (name === "late" || name === "modulelate") {
          assert.equal(result.postVeilHeroBelowOne, false, name)
          assert.equal(result.spec, null, "late library/module never starts Hero")
          await browser("wait", "--fn", "performance.now()>6400")
          if (name === "modulelate") {
            const amount = +(await browser(
              "eval",
              "document.querySelector('.komei-post-card').getBoundingClientRect().top-160",
            ))
            await browser("scroll", "down", String(Math.round(amount)))
            assert.equal(
              +(await browser(
                "eval",
                "gsap.getTweensOf(document.querySelector('.komei-post-card')).length",
              )),
              0,
              "card exposed before module load stays presented",
            )
          }
          await enterCard(".komei-home-gallery__postcard-card")
          const motion = JSON.parse(
            await browser(
              "eval",
              "({count:gsap.getTweensOf(__target).length,duration:gsap.getTweensOf(__target)[0]?.duration(),opacity:+getComputedStyle(__target).opacity})",
            ),
          )
          console.log(JSON.stringify({ fallbackRouteAfter6s: name, ...motion }))
          assert.equal(motion.count, 1, name)
          assert.equal(motion.duration, 0.62, name)
          await browser("wait", "--fn", "gsap.getTweensOf(__target).length===0")
        } else if (name.startsWith("paused")) {
          const resumed = JSON.parse(
            await browser(
              "eval",
              `(async()=>{const before=__stats();gsap.globalTimeline.resume();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));return {before,after:__stats()}})()`,
            ),
          )
          console.log(JSON.stringify({ resume: name, ...resumed }))
          assert.equal(resumed.before.tweens, 0, name)
          assert.equal(resumed.after.hidden, 0, name)
          assert.equal(resumed.after.dirty, 0, name)
          assert.equal(resumed.after.tweens, 0, name)
        } else {
          assert.equal(result.hidden, 0, name)
          assert.equal(result.dirty, 0, name)
          if (
            !["nojs", "note", "post", "reduced", "blocked", "armerror", "ioerror"].includes(name)
          ) {
            assert.ok(
              result.t0 !== null && result.t0 >= result.fcp - 4,
              `${name}: retreat must follow an actual paint, not prepaint RAF`,
            )
            if (!result.spec) assert.equal(result.postVeilHeroBelowOne, false, name)
          }
        }
        if (name === "stored")
          assert.equal(result.theme, "light", "stored theme wins over dark system")
      }
      for (const name of ["nomodule", "nojs", "note", "post", "reduced", "ioerror"])
        assert.ok(
          !requests.some((r) => r.scenario === name && r.path.endsWith("gsap.min.js")),
          name,
        )
      assert.ok(summaries.length === 16)
    } finally {
      try {
        await browser("close")
      } finally {
        timers.forEach(clearTimeout)
        server.closeAllConnections()
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          )
        await rm(profile, { recursive: true, force: true })
      }
    }
  },
)

// STARTUP_FIXTURE_PROBE=1 STARTUP_NATIVE_PROBE=1 bunx tsx --test <this file>
// Real components and native IO geometry. No synthetic entries, clock seeking,
// GSAP pause for visual claims, or production public build/output are involved.
test(
  "startup: native exposure boundary and real CSS completion",
  {
    skip: !enabled || process.env.STARTUP_NATIVE_PROBE !== "1",
    timeout: 150_000,
  },
  async () => {
    const compile = async (file: string) =>
      (
        await build({
          entryPoints: [file],
          bundle: true,
          write: false,
          format: "esm",
          platform: "browser",
          minify: true,
        })
      ).outputFiles[0].text
    const [bootstrap, animations, gsap] = await Promise.all([
      compile("quartz/components/scripts/komeiStartup.inline.ts"),
      compile("quartz/components/scripts/komeiAnimations.inline.ts"),
      readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"), "utf8"),
    ])
    const props = {
      fileData: { slug: "index" },
      allFiles: Array.from({ length: 5 }, (_, i) => ({
        slug: `notes/${i < 3 ? "public" : "other"}/fixture-${i}`,
        frontmatter: { title: "公开测试", tags: [] },
      })),
      cfg: { locale: "zh-CN", defaultDateType: "created" },
    } as unknown as QuartzComponentProps
    const markup = [HomeHero(), PostCards(), CategoryOverview(), HomeModules(), HomeGallery()]
      .map((Component) => render(h(Component, props)))
      .join("")
    const profile = await mkdtemp(join(tmpdir(), "home-native-regression-"))
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const server = createServer((req, res) => {
      const path = new URL(req.url!, "http://localhost").pathname
      const mode = new URL(req.headers.referer ?? "/", "http://localhost").pathname.split("/")[1]
      if (path.endsWith("gsap.min.js")) {
        if (mode === "blocked") return void res.writeHead(503).end()
        const timer = setTimeout(
          () => {
            timers.delete(timer)
            res.setHeader("Content-Type", "application/javascript")
            res.end(gsap)
          },
          mode === "late" ? 1500 : 200,
        )
        timers.add(timer)
        return
      }
      if (!path.endsWith("/")) return void res.writeHead(204).end()
      const name = path.split("/")[1]
      const early = name === "early" || name.startsWith("paused")
      const probe = `(()=>{window.__n={root:[],events:[],records:[],ios:[],clear:null,errors:[]};window.addEventListener('error',e=>{if(e.message)__n.errors.push(e.message)});
      const P=__n,N=IntersectionObserver;window.IntersectionObserver=class extends N{constructor(cb,o){const tracked=new Set;super((es,ob)=>{for(const e of es){if(e.target.matches('.komei-category-card'))P.events.push({t:performance.now(),type:'io',intersect:e.isIntersecting,top:e.boundingClientRect.top,root:e.rootBounds?.bottom,ratio:e.intersectionRatio,alpha:e.target.style.opacity,transform:e.target.style.transform})}cb(es,ob)},o);this.tracked=tracked;P.ios.push(tracked)}observe(e){this.tracked.add(e);super.observe(e)}unobserve(e){this.tracked.delete(e);super.unobserve(e)}disconnect(){this.tracked.clear();super.disconnect()}};
      for(const type of ['animationstart','animationend','animationcancel'])document.addEventListener(type,e=>{if(e.target===document.documentElement&&e.pseudoElement==='::before'&&e.animationName==='komei-entry-exit'){P.events.push({t:performance.now(),type,elapsed:e.elapsedTime});if(${JSON.stringify(name)}==='missingevent'&&type==='animationend')e.stopImmediatePropagation()}});
      let blocked=false;new MutationObserver(()=>{const v=document.documentElement.dataset.komeiVeil;if(v==='exiting'&&!P.exit){P.exit=performance.now();if(${JSON.stringify(name)}==='native'&&!blocked){blocked=true;const end=performance.now()+80;while(performance.now()<end){}P.injectedWork=80}}if(!v&&P.clear===null)P.clear=performance.now()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-komei-veil']});
      function sample(t){if(!P.records.length&&document.querySelector('.komei-home-gallery__postcard-card')){for(const[k,s]of [['post','.komei-post-card'],['category','.komei-category-card'],['music','.komei-module-card--music'],['photo','.komei-home-gallery-season'],['postcard','.komei-home-gallery__postcard-card']])for(const[e,i]of [...document.querySelectorAll(s)].map((e,i)=>[e,i]))P.records.push({element:e,kind:k,index:i,start:null,end:null,max:0,parent:0,values:[]})}
        for(const r of P.records){const ts=window.gsap?gsap.getTweensOf(r.element).filter(t=>t.duration()>0):[];r.max=Math.max(r.max,ts.length);if(ts.length&&r.start===null){r.start=t;r.duration=ts[0].duration();r.delay=ts[0].vars.delay||0}if(ts[0]?.time()>0&&!r.firstAdvance)r.firstAdvance={t,time:ts[0].time()};if(r.start!==null&&!ts.length&&r.end===null)r.end=t;for(let e=r.element.parentElement;e&&e!==document.body;e=e.parentElement)r.parent=Math.max(r.parent,window.gsap?gsap.getTweensOf(e).length:0);r.values.push({t,a:r.element.style.opacity,y:r.element.style.transform})}
        if(P.exit&&document.documentElement.dataset.komeiVeil)P.root.push({t,a:+getComputedStyle(document.documentElement,'::before').opacity});
        if(window.gsap&&!P.hero){const tl=gsap.globalTimeline.getChildren(false,false,true).find(x=>x.getChildren().some(t=>t.targets().includes(document.querySelector('h1'))));if(tl)P.hero={total:tl.duration(),children:tl.getChildren().map(t=>({duration:t.vars.duration,stagger:t.vars.stagger}))}}
        if(t<18000)requestAnimationFrame(sample)}requestAnimationFrame(sample);
      window.__nativeStats=()=>({veil:document.documentElement.dataset.komeiVeil,pending:document.querySelectorAll('[data-komei-entry]').length,queued:window.gsap?gsap.globalTimeline.getChildren(true,true,false).length:0,observed:__n.ios.reduce((n,s)=>n+s.size,0),dirty:__n.records.filter(r=>['opacity','visibility','transform','will-change','translate','rotate','scale'].some(p=>r.element.style.getPropertyValue(p))).length,hidden:__n.records.filter(r=>getComputedStyle(r.element).visibility==='hidden'||+getComputedStyle(r.element).opacity<.699).length});})()`
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${startupStyle}
      body{margin:0}#quartz-root{position:relative;height:4200px}nav{height:60px}.komei-home-hero{height:640px;position:relative;display:flex}.komei-home-hero__copy,.komei-profile-card{width:45%}.komei-home-hero__backdrop{position:absolute;inset:0;background:#ccd7df}
      .komei-post-card,.komei-category-card,.komei-module-card--music,.komei-home-gallery-season,.komei-home-gallery__postcard-card{box-sizing:border-box;position:absolute;margin:0;overflow:hidden;background:#e9eef3}
      .komei-post-card{top:811px;width:19%;height:164px}.komei-post-card:nth-child(2){left:20%}.komei-post-card:nth-child(3){left:40%}.komei-post-card:nth-child(4){left:60%}.komei-post-card:nth-child(5){left:80%}
      .komei-category-card{top:1122.34375px;width:44%;height:164px}.komei-category-card:nth-child(2){left:50%}.komei-module-card--music{top:1900px;width:80%;height:300px}.komei-home-gallery-season{top:2600px;width:15%;height:200px}.komei-home-gallery-season:nth-child(2){left:16%}.komei-home-gallery-season:nth-child(3){left:32%}.komei-home-gallery-season:nth-child(4){left:48%}.komei-home-gallery-season:nth-child(5){left:64%}.komei-home-gallery__postcard-card{top:3300px;width:80%;height:200px}svg{width:24px;height:24px}img{max-width:100%;max-height:160px}
      ${name === "posts" ? ".komei-post-card{top:1500px}" : ""}
      </style><script>${probe}</script><script data-startup-slug="index">${bootstrap}</script>${early ? `<script>${gsap};${name.startsWith("paused") ? "gsap.globalTimeline.pause()" : ""}</script>` : ""}${name === "noobserver" ? "<script>delete window.IntersectionObserver</script>" : ""}</head><body data-slug="index"><div id="quartz-root"><nav><a href="#recent-posts">首页</a></nav>${markup}</div><script>window.__cleanups=[];window.addCleanup=f=>__cleanups.push(f);${animations};document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}));</script></body></html>`)
    })
    let socket: WebSocket | undefined
    let next = 0
    const pending = new Map<
      number,
      { resolve: (value: any) => void; reject: (reason: Error) => void }
    >()
    const cdp = (method: string, params: object = {}) =>
      new Promise<any>((resolve, reject) => {
        const id = ++next
        pending.set(id, { resolve, reject })
        socket!.send(JSON.stringify({ id, method, params }))
      })
    const evaluate = async (expression: string) => {
      const result = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails)
        throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    }
    const frames = () =>
      evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    const wheel = async (deltaY: number) => {
      await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: 5, y: 380, deltaX: 0, deltaY })
      await frames()
    }
    const nativeBrowser = (...args: string[]) => browser("--profile", profile, ...args)
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      await nativeBrowser("open", "about:blank")
      await nativeBrowser("set", "viewport", "1440", "900")
      const port = +(await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]
      const targets = await new Promise<Array<{ type: string; webSocketDebuggerUrl: string }>>(
        (resolve, reject) => {
          get(`http://127.0.0.1:${port}/json/list`, { agent: false }, (response) => {
            let body = ""
            response.on("data", (chunk) => (body += chunk))
            response.on("end", () => resolve(JSON.parse(body)))
            response.on("error", reject)
          }).on("error", reject)
        },
      )
      socket = new WebSocket(targets.find((target) => target.type === "page")!.webSocketDebuggerUrl)
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString())
        const item = pending.get(message.id)
        if (!item) return
        pending.delete(message.id)
        if (message.error) item.reject(Error(JSON.stringify(message.error)))
        else item.resolve(message.result)
      })
      await new Promise<void>((resolve, reject) => {
        socket!.once("open", resolve)
        socket!.once("error", reject)
      })
      const summaries = []
      for (const name of [
        "native",
        "posts",
        "early",
        "late",
        "blocked",
        "pausedwatchdog",
        "pausedtab",
        "pausedpagehide",
        "routepaused",
        "missingevent",
        "noobserver",
        "reduced",
      ]) {
        await nativeBrowser(
          "set",
          "media",
          "light",
          name === "reduced" ? "reduced-motion" : "no-preference",
        )
        await nativeBrowser("open", `${origin}/${name}/`)
        if (name === "pausedtab") await nativeBrowser("press", "Tab")
        if (name === "pausedpagehide")
          await evaluate("dispatchEvent(new PageTransitionEvent('pagehide'))")
        if (name === "missingevent") {
          await nativeBrowser("wait", "--fn", "performance.now()>900")
          const transparent = await evaluate(
            "({veil:document.documentElement.dataset.komeiVeil,alpha:+getComputedStyle(document.documentElement,'::before').opacity})",
          )
          assert.deepEqual(
            transparent,
            { veil: "exiting", alpha: 0 },
            "missing event is visually transparent before its safety bound",
          )
        }
        await nativeBrowser(
          "wait",
          "--fn",
          `performance.now()>${name === "pausedwatchdog" || name === "missingevent" ? 3400 : name === "late" ? 1900 : 1400}`,
        )
        if (name === "native" || name === "late") {
          await nativeBrowser("wait", "--fn", "performance.now()>7100")
          await wheel(60)
          await wheel(40) // Prepares the category before any actual viewport exposure.
          await wheel(180)
          await wheel(-40) // A small reverse move cannot cancel the started tween.
          await wheel(112) // Old native 12% edge then makes y28 self-cancel.
          await evaluate("new Promise(r=>setTimeout(r,950))")
          if (name === "native") {
            const result = await evaluate(
              `({errors:__n.errors,records:__n.records.map(({element,values,...r})=>({...r,initial:values[0],motion:values.find(v=>v.a!==''),last:values.at(-1)})),events:__n.events,clear:__n.clear,exit:__n.exit,intermediate:__n.root.filter(f=>f.a>0&&f.a<1).length})`,
            )
            console.log(JSON.stringify({ nativeBoundary: result }))
            assert.deepEqual(result.errors, [])
            const posts = result.records.filter((r: any) => r.kind === "post")
            const categories = result.records.filter((r: any) => r.kind === "category")
            assert.equal(posts.length, 5)
            assert.ok(
              posts.every((r: any) => r.start === null),
              "already visible posts must not get another entrance",
            )
            assert.equal(categories.length, 2)
            categories.forEach((r: any, i: number) => {
              assert.equal(r.duration, 0.62)
              assert.equal(r.delay, i * 0.06)
              assert.ok(
                r.end - r.start >= 580 + i * 60,
                `native category must complete, not self-kill: ${r.end - r.start}`,
              )
              assert.equal(r.max, 1)
              assert.equal(r.parent, 0)
            })
            const visibleEntries = result.events.filter(
              (e: any) => e.type === "io" && e.root === 900 && e.intersect,
            )
            assert.equal(visibleEntries.length, 2)
            visibleEntries.forEach((entry: any, i: number) => {
              assert.equal(entry.alpha, "0.7", "initial state precedes actual exposure")
              assert.ok(categories[i].motion.t < entry.t)
            })
            const end = result.events.find((e: any) => e.type === "animationend")
            assert.equal(
              end?.elapsed,
              0.22,
              "actual CSS must finish despite the injected post-exit work",
            )
            assert.ok(
              result.clear >= end.t && result.clear - end.t < 30,
              "no fixed residence after native animationend",
            )
            assert.ok(result.intermediate >= 3)
            assert.ok(!result.events.some((e: any) => e.type === "animationcancel"))
          }
          // Prepare each still-unexposed real component in the band, then enter.
          for (const selector of [
            ".komei-module-card--music",
            ".komei-home-gallery-season",
            ".komei-home-gallery__postcard-card",
          ]) {
            const top = await evaluate(
              `document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top`,
            )
            await wheel(Math.round(top - 1000))
            await wheel(140)
            const mid = await evaluate(
              `(()=>{const e=document.querySelector(${JSON.stringify(selector)}),t=gsap.getTweensOf(e).filter(t=>t.duration()>0);return {count:t.length,duration:t[0]?.duration(),parent:gsap.getTweensOf(e.parentElement).length,opacity:+getComputedStyle(e).opacity}})()`,
            )
            console.log(JSON.stringify({ nativeCard: name, selector, ...mid }))
            assert.equal(mid.count, 1)
            assert.equal(mid.duration, 0.62)
            assert.equal(mid.parent, 0)
            assert.ok(mid.opacity >= 0.7 && mid.opacity < 1)
            if (selector === ".komei-module-card--music" && name === "native")
              await evaluate(
                `__n.records.find(r=>r.kind==='music').intentionalFocus=true;document.querySelector(${JSON.stringify(selector)}).querySelector('button').focus({preventScroll:true})`,
              )
            if (selector === ".komei-module-card--music" && name === "native")
              assert.equal(
                await evaluate(
                  `gsap.getTweensOf(document.querySelector(${JSON.stringify(selector)})).length`,
                ),
                0,
                "focus completes the active card immediately",
              )
            await evaluate("new Promise(r=>setTimeout(r,850))")
          }
          const components = await evaluate(
            "__n.records.filter(r=>r.kind!=='post').map(({element,values,...r})=>r)",
          )
          console.log(JSON.stringify({ completedNativeComponents: name, components }))
          assert.equal(components.length, 9)
          for (const item of components) {
            assert.equal(item.duration, 0.62, item.kind)
            assert.equal(item.max, 1, item.kind)
            assert.equal(item.parent, 0, item.kind)
            assert.ok(item.start > 6000 && item.end !== null, item.kind)
            if (!item.intentionalFocus)
              assert.ok(item.end - item.start >= 580 + item.delay * 1000, item.kind)
          }
          await wheel(-200)
          await wheel(200)
          assert.equal(
            await evaluate("gsap.getTweensOf(__n.records.map(r=>r.element)).length"),
            0,
            "completed cards do not replay on native re-entry",
          )
          await evaluate("document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}))")
        } else if (name === "posts") {
          await nativeBrowser("wait", "--fn", "performance.now()>7100")
          const top = await evaluate(
            "document.querySelector('.komei-post-card').getBoundingClientRect().top",
          )
          await wheel(Math.round(top - 1000))
          await wheel(140)
          await evaluate("new Promise(r=>setTimeout(r,1000))")
          const posts = await evaluate(
            "__n.records.filter(r=>r.kind==='post').map(({element,values,...r})=>r)",
          )
          console.log(JSON.stringify({ initiallyOffscreenPosts: posts }))
          assert.equal(posts.length, 5)
          posts.forEach((post: any, i: number) => {
            assert.equal(post.duration, 0.62)
            assert.equal(post.delay, i * 0.06)
            assert.equal(post.max, 1)
            assert.equal(post.parent, 0)
            assert.ok(post.start > 7000 && post.end - post.start >= 580 + i * 60)
          })
        } else if (name.startsWith("paused")) {
          await evaluate("gsap.globalTimeline.resume()")
          await frames()
          await frames()
        } else if (name === "routepaused") {
          await evaluate("gsap.globalTimeline.pause()")
          const top = await evaluate(
            "document.querySelector('.komei-category-card').getBoundingClientRect().top",
          )
          await wheel(Math.round(top - 1000))
          const prepared = await evaluate(
            "gsap.globalTimeline.getChildren(true,true,false).filter(t=>t.duration()===0).length",
          )
          assert.ok(prepared > 0, "exercise queued route setters, not only the Hero")
          await evaluate(
            "dispatchEvent(new PageTransitionEvent('pagehide'));gsap.globalTimeline.resume()",
          )
          await frames()
          await frames()
        }
        const state = await evaluate(
          "({...__nativeStats(),name:" +
            JSON.stringify(name) +
            ",hero:__n.hero,counts:__n.records.reduce((o,r)=>(o[r.kind]=(o[r.kind]||0)+1,o),{}),events:__n.events.filter(e=>e.type!=='io')})",
        )
        summaries.push(state)
        console.log(JSON.stringify({ nativeState: state }))
        assert.equal(state.veil, undefined)
        assert.equal(state.pending, 0)
        assert.equal(state.hidden, 0)
        assert.equal(state.dirty, 0)
        assert.deepEqual(state.counts, { post: 5, category: 2, music: 1, photo: 5, postcard: 1 })
        if (name === "early") {
          assert.equal(state.hero.total, 1.1)
          assert.ok(state.hero.children.some((t: any) => t.duration === 0.72 && t.stagger === 0.07))
        }
        if (name.startsWith("paused") || name === "routepaused") assert.equal(state.queued, 0)
        if (name === "routepaused" || name === "pausedpagehide") assert.equal(state.observed, 0)
      }
      assert.equal(summaries.length, 12)
    } finally {
      socket?.close()
      try {
        await nativeBrowser("close")
      } finally {
        timers.forEach(clearTimeout)
        server.closeAllConnections()
        if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
        await rm(profile, { recursive: true, force: true })
      }
    }
  },
)
