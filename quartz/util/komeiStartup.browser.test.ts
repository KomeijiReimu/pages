import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import { build } from "esbuild"
import { startupStyle } from "./komeiStartup"
import { criticalFontStyle, criticalFonts } from "./komeiFonts"

// A bounded PUBLIC fixture probe, not a replacement for real Quartz page/video tests.
// STARTUP_FIXTURE_PROBE=1 bunx tsx --test quartz/util/komeiStartup.browser.test.ts
// Uses only installed tools, an ephemeral loopback port and an isolated session.
const enabled = process.env.STARTUP_FIXTURE_PROBE === "1"
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
  "startup: duplicate observer entries create one owned tween, released by focus and pagehide",
  { skip: !enabled, timeout: 40_000 },
  async () => {
    const scripts = await Promise.all(
      [
        "quartz/components/scripts/komeiStartup.inline.ts",
        "quartz/components/scripts/komeiAnimations.inline.ts",
      ].map(async (file) => {
        const result = await build({
          entryPoints: [file],
          bundle: true,
          write: false,
          format: "esm",
          platform: "browser",
          minify: true,
        })
        return result.outputFiles[0].text
      }),
    )
    const gsap = await readFile(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"))
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(`<!doctype html><html><head><style>${startupStyle}</style>
        <script data-startup-slug="index">${scripts[0]}</script></head>
        <body data-slug="index"><div id="quartz-root">
        <section class="komei-home-hero"><h1>Public fixture</h1></section>
        <div style="height:1200px"></div>
        <article class="komei-post-card" id="duplicate-card"><a href="#duplicate-card">Public entry</a></article>
        <div style="height:1200px"></div></div><script>${gsap}</script><script>
        window.__created=[];
        const nativeFromTo=gsap.fromTo;
        gsap.fromTo=function(target,...args) {
          const tween=nativeFromTo.call(this,target,...args);
          if(target===document.querySelector('#duplicate-card')) window.__created.push(tween);
          return tween;
        };
        const NativeObserver=window.IntersectionObserver;
        window.IntersectionObserver=class extends NativeObserver {
          constructor(callback,options) {
            super((entries,observer)=>callback(entries.flatMap(entry=>[entry,entry]),observer),options);
          }
        };
        window.addCleanup=()=>{};${scripts[1]};
        document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}));
        </script></body></html>`)
    })
    const results: Array<{ action: string; created: number; before: number; after: number }> = []
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      assert.ok(address && typeof address === "object")
      await browser("set", "viewport", "1440", "900")
      for (const action of ["focus", "pagehide"]) {
        await browser("open", `http://127.0.0.1:${address.port}/`)
        const result = await browser(
          "eval",
          `(async () => {
          const card=document.querySelector('#duplicate-card');
          card.scrollIntoView();
          const deadline=performance.now()+2000;
          while(!window.__created.length) {
            if(performance.now()>deadline) throw new Error('production observer did not enter');
            await new Promise(requestAnimationFrame);
          }
          const before=gsap.getTweensOf(card).length;
          if(${JSON.stringify(action)}==='focus') card.querySelector('a').focus({preventScroll:true});
          else window.dispatchEvent(new PageTransitionEvent('pagehide'));
          return {action:${JSON.stringify(action)},created:window.__created.length,before,after:gsap.getTweensOf(card).length};
        })()`,
        )
        const observed = JSON.parse(result)
        console.log(observed)
        results.push(observed)
      }
      for (const result of results) {
        assert.deepEqual(result, { action: result.action, created: 1, before: 1, after: 0 })
      }
    } finally {
      try {
        await browser("close")
      } finally {
        server.closeAllConnections()
        if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    }
  },
)

test(
  "startup: bounded first-frame fault injection on a public fixture",
  { skip: !enabled, timeout: 180_000 },
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
          if (scenario === "late" || scenario === "slowclaim") {
            const timer = setTimeout(
              () => {
                delays.delete(timer)
                res.end(gsap)
              },
              scenario === "slowclaim" ? 900 : 4500,
            )
            delays.add(timer)
          } else res.end(scenario === "stalled" ? `${gsap};gsap.globalTimeline.pause();` : gsap)
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
        const slug =
          name === "note"
            ? "notes/public-fixture"
            : name === "post"
              ? "posts/public-fixture"
              : "index"
        const active = name !== "appblocked"
        const duration =
          name === "stalled"
            ? 6400
            : ["late", "fontslow", "imageslow"].includes(name)
              ? 5400
              : name === "slowclaim"
                ? 4400
                : 3600
        const sampler = `window.__frames=[]; window.__done=false;
         function sample(t) {
           if(window.gsap && !window.__introDurations) {
             const timelines=gsap.globalTimeline.getChildren(false,false,true);
             if(timelines.length) window.__introDurations=timelines.map(t=>t.totalDuration());
           }
          const title=document.querySelector('h1'), profile=document.querySelector('.komei-profile-card'), brand=document.querySelector('.brand'), backdrop=document.querySelector('.komei-home-hero__backdrop');
          if(title && profile && brand) {
            const s=getComputedStyle(title), p=getComputedStyle(profile), b=getComputedStyle(backdrop), r=document.createRange(); r.selectNodeContents(brand);
            window.__frames.push({t, a:+s.opacity, v:s.visibility, p:+p.opacity, pv:p.visibility, b:+b.opacity, bv:b.visibility, bt:b.transform, width:r.getBoundingClientRect().width, state:document.documentElement.dataset.komeiStartupState, controls:[...document.querySelectorAll('.komei-home-hero__actions a,.komei-profile-card__socials a,.komei-music-player button')].every(e=>getComputedStyle(e).visibility!=='hidden' && +getComputedStyle(e).opacity===1)});
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
          ${name === "mobile" ? ".komei-profile-card {margin-top:1000px}" : ""}
        </style><script>${sampler}</script>
        ${active ? `<script data-startup-slug="${slug}">${bootstrap}</script>` : ""}
        </head><body data-slug="${slug}"><div class="komei-background-layer" aria-hidden="true"></div><div id="quartz-root">
        <header><a class="brand">KomeijiReimu的博客</a></header>
        <section class="komei-home-hero"><div class="komei-home-hero__backdrop" aria-hidden="true"></div><div class="komei-home-hero__eyebrow">不动的大图书馆</div>
        <h1>相信的心就是你的魔法</h1><div class="komei-home-hero__actions"><a href="#latest">阅读最新文章</a></div>
        <aside class="komei-profile-card"><header class="komei-profile-card__identity">KomeijiReimu @brant</header><p class="komei-profile-card__motto">知识的幻想乡。</p><dl class="komei-profile-card__facts"><dt>Public</dt><dd>Fixture</dd></dl><div class="komei-profile-card__socials"><a href="#latest">Public link</a></div></aside></section>
        <div style="height:1200px"></div><section id="latest"><article class="komei-post-card" id="focus-card"><a href="#latest">Focus fixture</a></article><article class="komei-post-card" id="reveal-card"><a href="#latest">Reveal fixture</a></article><div class="komei-module-card"><div class="komei-music-player"><button>Play fixture</button></div></div></section><div style="height:1200px"></div></div>
        ${active ? `<script>${name === "observerblocked" ? "delete window.IntersectionObserver;" : ""}window.__cleanups=[];window.addCleanup=fn=>window.__cleanups.push(fn);${animations};document.dispatchEvent(new CustomEvent('nav',{detail:{url:'${slug}'}}));</script>` : ""}
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
      for (const name of [
        "normal",
        "slowclaim",
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
        "interrupted",
        "reducedmid",
        "mobile",
        "observerblocked",
        "reduced",
      ]) {
        if (name === "reduced") await browser("set", "media", "light", "reduced-motion")
        if (name === "mobile") await browser("set", "viewport", "390", "844")
        await browser("open", `${origin}/${name}/`)
        if (name === "interrupted" || name === "reducedmid") {
          await browser("wait", "--fn", "performance.now()>650")
          if (name === "reducedmid") await browser("set", "media", "light", "reduced-motion")
          else
            await browser(
              "eval",
              "document.dispatchEvent(new Event('prenav')); window.__cleanups.forEach(fn=>fn()); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));",
            )
          await browser(
            "eval",
            `(() => {
            if(document.documentElement.dataset.komeiStartupState!=='revealed' || document.querySelector('[data-komei-entry]')) throw new Error('mid-animation lifecycle left a gate');
            if([...document.querySelectorAll('.komei-home-hero *')].some(e=>e.style.opacity || e.style.visibility || e.style.transform || e.style.willChange)) throw new Error('mid-animation lifecycle left inline motion');
            document.querySelector('#reveal-card').scrollIntoView();
          })()`,
          )
        }
        await browser("wait", "--fn", "window.__done === true")
        const result = await browser(
          "eval",
          `(() => {
        const frames=window.__frames, visible=f=>f.a>0.01 && f.v!=='hidden' && f.p>0.01 && f.pv!=='hidden';
        const first=frames.findIndex(visible); if(first<0) throw new Error('never readable');
         if(${JSON.stringify(name !== "stalled")} && frames[first].t>1600) throw new Error('readability deadline exceeded: '+frames[first].t);
         if(frames.some(f=>!f.controls)) throw new Error('interactive controls entered the startup gate');
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
          const firstTitle=frames.findIndex(f=>f.a>0.001 && f.v!=='hidden');
          if(frames[firstTitle].t<=frames[firstBackdrop].t) throw new Error('text did not follow illustration');
         }
         if(${JSON.stringify(["normal", "slowclaim"].includes(name))}) {
           if(!window.__introDurations?.some(d=>Math.abs(d-3.15)<0.001)) throw new Error('production GSAP timeline is not 3.15 seconds: '+JSON.stringify(window.__introDurations));
           const finish=frames.find(f=>f.state==='revealed');
           if(!finish || finish.t<2800 || finish.t>${name === "slowclaim" ? 4600 : 3800}) throw new Error('entrance bounds: '+JSON.stringify(finish));
           if(${JSON.stringify(name === "slowclaim")} && !frames.some(f=>f.t>3200 && f.state==='claimed')) throw new Error('3200ms truncated a late-claimed real GSAP timeline');
         }
         if(${JSON.stringify(name === "stalled")} && (!frames.some(f=>f.t>5800 && f.state==='claimed') || document.documentElement.dataset.komeiStartupState!=='revealed')) throw new Error('6000ms stall guard failed');
         if(${JSON.stringify(["interrupted", "reducedmid", "observerblocked"].includes(name))} && gsap.getTweensOf(document.querySelector('#reveal-card')).length) throw new Error('inactive page still animates cards');
         if(${JSON.stringify(name === "mobile")} && (document.querySelector('.komei-profile-card__identity').style.opacity || document.querySelector('.komei-profile-card__facts').style.transform || !window.__introDurations?.some(d=>Math.abs(d-2.8)<0.001))) throw new Error('offscreen mobile profile played in the intro');
        return {scenario:${JSON.stringify(name)},frames:frames.length,firstVisible:frames[first].t,widthRange:[Math.min(...widths),Math.max(...widths)],state:document.documentElement.dataset.komeiStartupState};
      })()`,
        )
        console.log(result.trim())
        if (name === "normal") {
          console.log(
            (
              await browser(
                "eval",
                `(async () => {
            while(performance.now()<6300) await new Promise(requestAnimationFrame);
            const card=document.querySelector('#reveal-card'), focused=document.querySelector('#focus-card');
            if(+getComputedStyle(card).opacity!==1 || getComputedStyle(card).visibility==='hidden') throw new Error('offscreen card was hidden while waiting');
            focused.querySelector('a').focus({preventScroll:true});
            document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}));
            if(document.querySelector('[data-komei-entry]')) throw new Error('duplicate nav re-hid content');
            card.scrollIntoView();
            while(!gsap.getTweensOf(card).length) { if(performance.now()>8500) throw new Error('offscreen observer expired with startup'); await new Promise(requestAnimationFrame); }
            const tween=gsap.getTweensOf(card)[0];
            if(tween.duration()!==1.1) throw new Error('not the production reveal tween');
            if(gsap.getTweensOf(focused).length) throw new Error('focused group animated');
            card.querySelector('a').focus({preventScroll:true});
            if(gsap.getTweensOf(card).length || card.style.opacity || card.style.transform) throw new Error('focus did not finish its group');
            window.scrollTo(0,0);
            card.scrollIntoView();
            await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
            if(gsap.getTweensOf(card).length) throw new Error('single-enter group replayed');
            window.dispatchEvent(new PageTransitionEvent('pagehide'));
            window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
            document.dispatchEvent(new CustomEvent('nav',{detail:{url:'index'}}));
            if(document.querySelector('[data-komei-entry]') || [...document.querySelectorAll('.komei-post-card')].some(e=>e.style.opacity || e.style.transform)) throw new Error('bfcache/duplicate nav leaked motion');
            return {afterSixSeconds:true,focus:true,singleEnter:true,bfcache:true};
          })()`,
              )
            ).trim(),
          )
        }
        if (name === "mobile") {
          console.log(
            (
              await browser(
                "eval",
                `(async () => {
            const identity=document.querySelector('.komei-profile-card__identity');
            identity.scrollIntoView();
            const until=performance.now()+1800;
            while(!gsap.getTweensOf(identity).length) { if(performance.now()>until) throw new Error('mobile profile did not reveal on entry'); await new Promise(requestAnimationFrame); }
            if(gsap.getTweensOf(identity)[0].duration()!==0.95) throw new Error('mobile reveal duration');
            window.scrollTo(0,0);
            await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
            if(identity.style.opacity || identity.style.transform || gsap.getTweensOf(identity).length) throw new Error('fast scroll did not release offscreen motion');
            return {mobileViewport:true,offscreenNotPreplayed:true,fastScroll:true};
          })()`,
              )
            ).trim(),
          )
          await browser("set", "viewport", "1440", "900")
        }
        if (name === "reducedmid") await browser("set", "media", "light", "no-preference")
      }
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
