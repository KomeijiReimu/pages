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
  "startup: bounded first-frame fault injection on a public fixture",
  { skip: !enabled, timeout: 100_000 },
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
        const duration = name === "late" || name === "fontslow" ? 5400 : 1800
        const sampler = `window.__frames=[]; window.__done=false;
        function sample(t) {
          const title=document.querySelector('h1'), profile=document.querySelector('.komei-profile-card'), brand=document.querySelector('.brand');
          if(title && profile && brand) {
            const s=getComputedStyle(title), p=getComputedStyle(profile), r=document.createRange(); r.selectNodeContents(brand);
            window.__frames.push({t, a:+s.opacity, v:s.visibility, p:+p.opacity, pv:p.visibility, width:r.getBoundingClientRect().width, state:document.documentElement.dataset.komeiStartupState});
          }
          if(t<${duration}) requestAnimationFrame(sample); else window.__done=true;
        } requestAnimationFrame(sample);`
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(`<!doctype html><html><head><meta charset="utf-8">
        ${criticalFonts.map((font) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/static/fonts/startup/${font.file}">`).join("")}
        <style>${criticalFontStyle("")}${startupStyle}
          .brand,h1 {font-family:"Komei UI Serif",serif;font-weight:500;font-size:32px}
          .komei-profile-card {font-family:"Komei UI Sans",sans-serif}
        </style><script>${sampler}</script>
        ${active ? `<script data-startup-slug="${slug}">${bootstrap}</script>` : ""}
        </head><body data-slug="${slug}"><div id="quartz-root">
        <header><a class="brand">KomeijiReimu的博客</a></header>
        <section class="komei-home-hero"><div class="komei-home-hero__eyebrow">不动的大图书馆</div>
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
      await browser("set", "viewport", "1440", "900")
      for (const name of [
        "normal",
        "late",
        "blocked",
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
      }
    }
  },
)
