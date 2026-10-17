import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import { build } from "esbuild"
import { startupStyle } from "./komeiStartup"
import { criticalFontStyle, criticalFonts } from "./komeiFonts"
import { h } from "preact"
import render from "preact-render-to-string"
import HomeHero from "../components/HomeHero"
import HomeModules from "../components/HomeModules"
import CategoryOverview from "../components/CategoryOverview"
import TagCloud from "../components/TagCloud"
import type { QuartzComponentProps } from "../components/types"

// A bounded PUBLIC fixture probe, not a replacement for real Quartz page/video tests.
// STARTUP_FIXTURE_PROBE=1 bunx tsx --test quartz/util/komeiStartup.browser.test.ts
// Uses only installed tools, an ephemeral loopback port and an isolated session.
const enabled = process.env.STARTUP_FIXTURE_PROBE === "1"
// Bound a regression run to the three clock-resume cleanup paths.
const resumeOnly = process.env.STARTUP_RESUME_PROBE === "1"
const session = `startup-fixture-${process.pid}-${Date.now().toString(36)}`
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
  { skip: !enabled, timeout: 140_000 },
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
    // Actual current components/config, not an invented profile/facts layout.
    // Styles are unchanged by this task: use existing CSS, never public JS.
    const css = await readFile(new URL("../../public/index.css", import.meta.url), "utf8")
    const props = { fileData: { slug: "index" }, allFiles: [] } as unknown as QuartzComponentProps
    const hero = render(h(HomeHero(), props))
    const sections = [CategoryOverview(), TagCloud(), HomeModules()]
      .map((Component) => render(h(Component, props)))
      .join("")
    const requests: Array<{ path: string; scenario: string }> = []
    const delays = new Set<ReturnType<typeof setTimeout>>()
    const server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url!, "http://127.0.0.1:8097").pathname)
        const scenario = new URL(
          req.headers.referer ?? "http://127.0.0.1/",
          "http://127.0.0.1",
        ).pathname.split("/")[1]
        requests.push({ path, scenario })
        res.setHeader("Cache-Control", "no-store")
        if (path === "/index.css") {
          res.setHeader("Content-Type", "text/css")
          res.end(css)
          return
        }
        if (path === "/static/back (2).jpg") {
          if (scenario === "imageblocked") {
            res.writeHead(503).end()
            return
          }
          res.setHeader("Content-Type", "image/jpeg")
          const image = await readFile(new URL("../static/back (2).jpg", import.meta.url))
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
          } else
            res.end(
              scenario === "stalled" || scenario.startsWith("resume-")
                ? `${gsap};gsap.globalTimeline.pause();`
                : gsap,
            )
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
        if (path.startsWith("/static/")) {
          if (path.includes("..")) return res.writeHead(404).end()
          res.setHeader(
            "Content-Type",
            path.endsWith(".svg")
              ? "image/svg+xml"
              : path.endsWith(".png")
                ? "image/png"
                : "image/jpeg",
          )
          res.end(await readFile(new URL(`../static/${path.slice(8)}`, import.meta.url)))
          return
        }
        const name = path.split("/")[1]
        const slug =
          name === "note"
            ? "notes/public-fixture"
            : name === "post"
              ? "posts/public-fixture"
              : "index"
        const active = name !== "appblocked"
        const duration = ["late", "fontslow", "imageslow"].includes(name)
          ? 5400
          : name === "stalled"
            ? 3500
            : 1800
        const sampler = `window.__frames=[]; window.__done=false;
        function sample(t) {
          const title=document.querySelector('h1'), profile=document.querySelector('.komei-profile-card'), brand=document.querySelector('.brand'), backdrop=document.querySelector('.komei-home-hero__backdrop'), hero=document.querySelector('.komei-home-hero');
          if(title && profile && brand) {
            const effective=e=>{let a=1,v='visible';for(let n=e;n&&n!==document.documentElement;n=n.parentElement){const s=getComputedStyle(n);a*=+s.opacity;if(s.visibility==='hidden')v='hidden'}return {a,v}};
            const s=effective(title), p=effective(profile), b=effective(backdrop), hr=effective(hero), r=document.createRange();r.selectNodeContents(brand);
            const cohort=[hero,profile,...hero.querySelectorAll('.komei-home-hero__actions a,.komei-profile-card__socials')].map(e=>effective(e).a);
            const shells=[...document.querySelectorAll('.komei-home-hero,.komei-category-overview,.komei-tag-cloud-section,.komei-home-modules')].filter(e=>e.getBoundingClientRect().top<innerHeight&&e.getBoundingClientRect().bottom>0).map(e=>({class:e.className,...effective(e)}));
            window.__frames.push({t,a:s.a,v:s.v,p:p.a,pv:p.v,b:b.a,bv:b.v,bt:getComputedStyle(backdrop).transform,ha:hr.a,cohort,shells,y:scrollY,nav:effective(brand),width:r.getBoundingClientRect().width,state:document.documentElement.dataset.komeiStartupState});
            if(window.gsap&&!window.__spec){const timelines=gsap.globalTimeline.getChildren(false,false,true);const tl=timelines.find(t=>t.getChildren().some(x=>x.targets?.().includes(hero)));if(tl)window.__spec={total:tl.totalDuration(),defaults:gsap.defaults().duration,tweens:tl.getChildren(false,true,false).map(x=>({actionDuration:x.vars.duration,stagger:x.vars.stagger,start:x.startTime(),targets:x.targets().map(e=>e.className||e.tagName)})),sections:gsap.globalTimeline.getChildren(false,true,false).filter(x=>x.targets?.().some(e=>e.matches?.('.komei-category-overview,.komei-tag-cloud-section,.komei-home-modules'))).map(x=>({duration:x.vars.duration,stagger:x.vars.stagger}))};}
          }
          if(t<${duration}) requestAnimationFrame(sample); else window.__done=true;
        } requestAnimationFrame(sample);`
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(`<!doctype html><html><head><meta charset="utf-8">
        ${criticalFonts.map((font) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/static/fonts/startup/${font.file}">`).join("")}
        <link rel="stylesheet" href="/index.css"><style>${criticalFontStyle("")}${startupStyle}</style><script>${sampler}</script>
        ${active ? `<script data-startup-slug="${slug}">${bootstrap}</script>` : ""}
        </head><body data-slug="${slug}"><div class="komei-background-layer" aria-hidden="true"></div><div id="quartz-root" class="page"><div id="quartz-body"><div class="center"><div class="page-header">
        <header><div class="komei-nav-slot"><div class="komei-site-header"><a class="komei-site-header__brand brand" href="#">KomeijiReimu的博客</a><nav class="komei-top-nav"><div class="komei-top-nav__links"><a href="#">首页</a></div></nav></div></div></header>
        <div class="popover-hint">${hero}${sections}</div></div></div></div></div>
        ${active ? `<script>window.__cleanups=[];window.addCleanup=fn=>window.__cleanups.push(fn);${animations};document.dispatchEvent(new CustomEvent('nav',{detail:{url:'${slug}'}}));</script>` : ""}
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
      await browser("set", "viewport", "1440", "900")
      const resumeCases = ["resume-watchdog", "resume-tab", "resume-pagehide"]
      const resumeResults: Array<{
        scenario: string
        released: {
          queued: number
          setters: number
          hidden: string[]
          dirty: string[]
          maxY: number
        }
        resumed: {
          queued: number
          setters: number
          hidden: string[]
          dirty: string[]
          maxY: number
        }
      }> = []
      for (const name of resumeOnly
        ? resumeCases
        : [
            "normal",
            "focus",
            "interrupted",
            "bfcache",
            "stalled",
            "late",
            "blocked",
            "imageblocked",
            "imageslow",
            "fontblocked",
            "fontslow",
            "appblocked",
            "note",
            "post",
            "fontwarm",
            "fontwarm",
            ...resumeCases,
            "reduced",
          ]) {
        if (name === "reduced") await browser("set", "media", "light", "reduced-motion")
        await browser("open", `${origin}/${name}/`)
        if (resumeCases.includes(name)) {
          await browser(
            "wait",
            "--fn",
            "!!window.__spec && document.documentElement.dataset.komeiStartupState==='claimed'",
          )
          const before = await browser(
            "eval",
            `(() => {
            window.__resumeSnapshot=()=>{
              const nodes=[...document.querySelectorAll('.komei-home-hero,.komei-home-hero__backdrop,.komei-home-hero__eyebrow,.komei-home-hero h1,.komei-home-hero__actions > *,.komei-profile-card,.komei-category-overview,.komei-tag-cloud-section,.komei-home-modules')];
              const owned=gsap.globalTimeline.getChildren(true,true,false).filter(t=>t.targets().some(e=>nodes.includes(e)));
              const props=['opacity','visibility','transform','will-change','translate','rotate','scale'];
              return {state:document.documentElement.dataset.komeiStartupState,queued:owned.length,setters:owned.filter(t=>t.duration()===0).length,hidden:nodes.filter(e=>getComputedStyle(e).visibility==='hidden'||+getComputedStyle(e).opacity===0).map(e=>e.className||e.tagName),dirty:nodes.filter(e=>props.some(p=>e.style.getPropertyValue(p))).map(e=>e.className||e.tagName),maxY:Math.max(...nodes.map(e=>{const t=getComputedStyle(e).transform;return t==='none'?0:Math.abs(new DOMMatrix(t).m42)}))};
            };
            return window.__resumeSnapshot();
          })()`,
          )
          if (name === "resume-tab") await browser("press", "Tab")
          if (name === "resume-pagehide")
            await browser("eval", "window.dispatchEvent(new PageTransitionEvent('pagehide'))")
          await browser(
            "wait",
            "--fn",
            "document.documentElement.dataset.komeiStartupState==='revealed'",
          )
          const result = await browser(
            "eval",
            `(async () => {
            const released=window.__resumeSnapshot();
            gsap.globalTimeline.resume();
            for(let i=0;i<3;i++) await new Promise(requestAnimationFrame);
            return {scenario:${JSON.stringify(name)},before:${before},released,resumed:window.__resumeSnapshot()};
          })()`,
          )
          const observed = JSON.parse(result)
          console.log(observed)
          resumeResults.push(observed)
          continue
        }
        if (["focus", "interrupted", "bfcache"].includes(name)) {
          await browser("wait", "--fn", "!!window.__spec")
          if (name === "focus") await browser("press", "Tab")
          if (name === "interrupted")
            await browser(
              "eval",
              "document.dispatchEvent(new Event('prenav'));window.__cleanups.forEach(fn=>fn())",
            )
          if (name === "bfcache")
            await browser(
              "eval",
              "window.dispatchEvent(new PageTransitionEvent('pagehide'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))",
            )
        }
        await browser("wait", "--fn", "window.__done === true")
        const result = await browser(
          "eval",
          `(() => {
        const frames=window.__frames, visible=f=>f.a>0.01 && f.v!=='hidden' && f.p>0.01 && f.pv!=='hidden';
        const first=frames.findIndex(visible); if(first<0) throw new Error('never readable');
         if(${JSON.stringify(name !== "stalled")} && frames[first].t>1600) throw new Error('readability deadline exceeded: '+frames[first].t);
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
        if(${JSON.stringify(["normal", "imageblocked", "imageslow", "fontblocked", "fontwarm"].includes(name))}) {
          if(!frames.some(f=>f.b>0 && f.b<0.99 && f.bt!=='none')) throw new Error('illustration fade/scale not observed');
           if(frames.some(f=>f.cohort.some(a=>Math.abs(a-f.ha)>.001))) throw new Error('Hero surface/copy/controls split their opacity gate');
           if(frames[0].ha!==0 || frames[0].shells.some(s=>s.a!==0)) throw new Error('initial home surfaces exposed before the shared entrance: '+JSON.stringify(frames[0]));
           if(frames[0].t>=fcp) throw new Error('first gate evidence was not before FCP');
           if(window.__spec.defaults!==.55 || window.__spec.tweens.some(t=>t.actionDuration!==.72) || !window.__spec.tweens.some(t=>t.stagger===.07) || window.__spec.sections.some(t=>t.duration!==.62||t.stagger!==.06)) throw new Error('original action speed changed: '+JSON.stringify(window.__spec));
         }
         if(frames.some(f=>f.nav.a!==1||f.nav.v==='hidden'||f.y!==0)) throw new Error('navigation/viewport changed with the entrance');
         if([...document.querySelectorAll('.komei-home-hero *,.komei-home-hero,.komei-category-overview,.komei-tag-cloud-section,.komei-home-modules')].some(e=>e.style.opacity||e.style.visibility||e.style.transform||e.style.willChange)) throw new Error('cohort inline state leaked');
         const offscreen=document.querySelector('.komei-home-modules');
         if(getComputedStyle(offscreen).opacity!=='1'||getComputedStyle(offscreen).visibility==='hidden') throw new Error('offscreen surface waited hidden');
         document.dispatchEvent(new CustomEvent('nav',{detail:{url:document.body.dataset.slug}}));
         if(document.querySelector('[data-komei-entry]')) throw new Error('duplicate nav re-hid the cohort');
         return {scenario:${JSON.stringify(name)},frames:frames.length,firstSample:frames[0].t,fcp,firstVisible:frames[first].t,initialShells:frames[0].shells,spec:window.__spec,state:document.documentElement.dataset.komeiStartupState};
      })()`,
        )
        console.log(result.trim())
      }
      for (const result of resumeResults) {
        for (const phase of ["released", "resumed"] as const) {
          assert.equal(result[phase].queued, 0, `${result.scenario} ${phase}: orphan GSAP work`)
          assert.equal(result[phase].setters, 0, `${result.scenario} ${phase}: orphan setters`)
          assert.deepEqual(result[phase].hidden, [], `${result.scenario} ${phase}: re-hidden body`)
          assert.deepEqual(result[phase].dirty, [], `${result.scenario} ${phase}: inline state`)
          assert.equal(result[phase].maxY, 0, `${result.scenario} ${phase}: y revived`)
        }
      }
      if (!resumeOnly) {
        assert.ok(requests.some((r) => r.scenario === "late" && r.path.endsWith("gsap.min.js")))
        assert.ok(
          !requests.some(
            (r) =>
              ["note", "post", "reduced", "appblocked"].includes(r.scenario) &&
              r.path.endsWith("gsap.min.js"),
          ),
        )
        assert.equal(
          requests.filter((r) => r.scenario === "fontwarm" && r.path.endsWith(".woff2")).length,
          4,
          "second fontwarm document reuses the four cached assets",
        )
      }
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
      }
    }
  },
)
