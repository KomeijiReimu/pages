import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { resolve } from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { build } from "esbuild"
import { createTestDirectory } from "../../test/helpers/temp"

// Opt-in, synthetic HTML only. No private content, Quartz preview or dependency install.
// SCROLL_HISTORY_BROWSER=1 bun run test quartz/components/scripts/scrollHistory.browser.test.ts
const run = promisify(execFile)

test(
  "scroll history: real SPA/drawer bundle in isolated headless Chromium",
  {
    skip: process.env.SCROLL_HISTORY_BROWSER !== "1",
    timeout: 180_000,
  },
  async (t) => {
    // Chromium adds its own socket path below TMPDIR; leave room for AF_UNIX.
    const cache = await createTestDirectory(t, "pg-sh-")
    await build({
      stdin: {
        contents: 'import "./readingDrawer.inline"; import "./spa.inline"',
        resolveDir: resolve("quartz/components/scripts"),
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      outfile: `${cache}/production.js`,
    })
    const bundle = await readFile(`${cache}/production.js`)
    const html = (path: string) => {
      const short = path === "/b"
      const height = short ? 120 : path === "/grow" ? 900 : 6000
      const padding = path === "/native" ? 270_000 : path === "/heavy" ? 190_000 : 0
      return `<!doctype html><html><head><title>${path}</title>
      <style data-persist>html{scroll-behavior:auto;overflow-anchor:none}body{margin:0}nav.fixture{position:fixed;top:0;z-index:2;background:white}#spacer{height:${height}px}.reading-tools{position:fixed;bottom:0}.reading-drawer{width:280px}.reading-drawer__panel{min-height:120px}</style>
      <script data-persist>window.fixtureNav=[];document.addEventListener('nav',()=>{fixtureNav.push({path:location.pathname,slug:document.body.dataset.slug});if(location.pathname==='/grow')setTimeout(()=>document.querySelector('#spacer').style.height='6000px',350)});window.fixtureShows=[];addEventListener('pageshow',e=>fixtureShows.push(e.persisted));</script>
      <script data-persist>
      window.fixtureRestoreWork={live:0,max:0,callbacks:0,scrollCalls:0};
      const NativeResizeObserver=window.ResizeObserver;
      window.ResizeObserver=class extends NativeResizeObserver {
        active=false;
        constructor(callback){super((entries,observer)=>{fixtureRestoreWork.callbacks++;callback(entries,observer)})}
        observe(...args){if(!this.active){this.active=true;fixtureRestoreWork.live++;fixtureRestoreWork.max=Math.max(fixtureRestoreWork.max,fixtureRestoreWork.live)}super.observe(...args)}
        disconnect(){if(this.active){this.active=false;fixtureRestoreWork.live--}super.disconnect()}
      };
      const nativeScrollTo=window.scrollTo.bind(window);
      window.scrollTo=(...args)=>{fixtureRestoreWork.scrollCalls++;nativeScrollTo(...args)};
      </script>
      <script data-persist defer src="/production.js"></script></head>
      <body data-slug="${path.slice(1) || "index"}"><div id="quartz-root"><nav class="fixture">
      <a id="to-a" href="/a">A</a> <a id="to-b" href="/b">B</a>
      <a id="to-heavy" href="/heavy">heavy</a> <a id="to-native" href="/native">native</a>
      <a id="to-hash" href="${path}#heading">heading</a></nav>
      <div class="toc"><button data-reading-drawer="toc" aria-controls="toc-content">TOC</button>
      <div id="toc-content" class="toc-content"><a id="drawer-b" href="/b">B drawer</a></div></div>
      <main><h1>${path}</h1><div id="spacer"></div><h2 id="heading">heading</h2><div style="height:1500px"></div></main>
      <!--${"x".repeat(padding)}--></div></body></html>`
    }
    const server = createServer((req, res) => {
      const path = new URL(req.url!, "http://fixture").pathname
      if (path === "/production.js") {
        res.setHeader("content-type", "text/javascript")
        res.end(bundle)
        return
      }
      if (path === "/favicon.ico") {
        res.writeHead(204)
        res.end()
        return
      }
      if (path === "/error") {
        setTimeout(() => res.destroy(), 500)
        return
      }
      const send = () => {
        const text = html(path)
        res.setHeader("content-type", "text/html")
        res.setHeader("content-length", Buffer.byteLength(text))
        res.end(text)
      }
      if (path === "/slow") setTimeout(send, 700)
      else send()
    })
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const session = `scroll-history-${process.pid}`
    const browser = async (...args: string[]) => {
      const result = await run(
        "agent-browser",
        ["--session", session, "--headed", "false", ...args],
        {
          timeout: 35_000,
          maxBuffer: 4_000_000,
          env: { ...process.env, TMPDIR: cache, AGENT_BROWSER_RESTORE_SAVE: "never" },
        },
      )
      return result.stdout
    }
    const evaluate = (code: string) => browser("eval", `(() => { ${code} })()`)
    const check = (expression: string, message: string) =>
      evaluate(
        `if (!(${expression})) throw Error(${JSON.stringify(message)}); return {y:scrollY,url:location.href,state:history.state,slug:document.body.dataset.slug}`,
      )
    const wait = (expression: string) => browser("wait", "--fn", expression)
    const open = async (path = "/a") => {
      await browser("open", origin + path)
      await wait("typeof window.spaNavigate === 'function'")
      await browser("set", "viewport", "700", "800")
    }
    const scroll = (y: number) =>
      evaluate(`dispatchEvent(new WheelEvent('wheel'));scrollTo(0,${y});return scrollY`)
    const nav = (path: string) =>
      evaluate(`void spaNavigate(new URL(${JSON.stringify(path)},location.href));return true`)
    const at = (path: string) =>
      wait(
        `location.pathname===${JSON.stringify(path)} && document.body.dataset.slug===${JSON.stringify(path.slice(1))}`,
      )
    try {
      await t.test(
        "A 2000 -> short B -> back restores within 2px, forward restores B",
        async () => {
          await open()
          await evaluate(
            "history.replaceState({...history.state,foreign:{keep:42}},'');return true",
          )
          await scroll(2000)
          await nav("/b")
          await at("/b")
          await scroll(50)
          await browser("back")
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
          await check(
            "Math.abs(scrollY-2000)<=2 && history.state.foreign.keep===42",
            "A restored, foreign state preserved",
          )
          await browser("forward")
          await at("/b")
          await wait("Math.abs(scrollY-50)<=2")
        },
      )
      await t.test("same URL repeated entries keep separate positions", async () => {
        await open()
        await scroll(2000)
        await evaluate("window.firstId=history.state.__quartzScroll.id;return true")
        await nav("/b")
        await at("/b")
        await nav("/a")
        await at("/a")
        await scroll(900)
        await check("history.state.__quartzScroll.id!==firstId", "each A owns an ID")
        await browser("back")
        await at("/b")
        await browser("back")
        await at("/a")
        await wait("Math.abs(scrollY-2000)<=2")
        await browser("forward")
        await at("/b")
        await browser("forward")
        await at("/a")
        await wait("Math.abs(scrollY-900)<=2")
      })
      await t.test(
        "hash clicks locate; traversal prefers the saved position, not the anchor",
        async () => {
          await open()
          await scroll(2000)
          await browser("click", "#to-hash")
          await wait(
            "location.hash==='#heading' && Math.abs(document.querySelector('#heading').getBoundingClientRect().top)<2",
          )
          await scroll(2800)
          await browser("back")
          await wait("location.hash==='' && Math.abs(scrollY-2000)<=2")
          await browser("forward")
          await wait("location.hash==='#heading' && Math.abs(scrollY-2800)<=2")
          await browser("wait", "1900")
          await check(
            "Math.abs(scrollY-2800)<=2 && !document.body.classList.contains('komei-page-is-leaving')",
            "hash traversal restores without orphan transition classes",
          )
        },
      )
      await t.test(
        "heavy route uses the same restoration and native budget remains enforced",
        async () => {
          await open("/heavy")
          await scroll(2100)
          await nav("/b")
          await at("/b")
          await browser("back")
          await at("/heavy")
          await wait("Math.abs(scrollY-2100)<=2")
          await check(
            "document.body.classList.contains('komei-route-heavy-page') && !!document.querySelector('route-announcer')",
            "heavy replacement path exercised",
          )
        },
      )
      await t.test(
        "late fetch/error/native fallback and rapid back-forward cannot commit obsolete routes",
        async () => {
          await open()
          await scroll(2000)
          await nav("/b")
          await at("/b")
          await evaluate(
            "void spaNavigate(new URL('/slow',location.href));setTimeout(()=>history.back(),30);return true",
          )
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
          await browser("wait", "900")
          await check(
            "location.pathname==='/a' && document.body.dataset.slug==='a'",
            "slow navigation cannot commit after back",
          )
          await evaluate(
            "void spaNavigate(new URL('/error',location.href));setTimeout(()=>spaNavigate(new URL('/b',location.href)),30);return true",
          )
          await at("/b")
          await browser("wait", "750")
          await check("location.pathname==='/b'", "old errors cannot trigger native fallback")
          await evaluate(
            "void spaNavigate(new URL('/native',location.href));setTimeout(()=>history.back(),30);return true",
          )
          await at("/a")
          await browser("wait", "850")
          await check("location.pathname==='/a'", "old native shell cannot navigate")
          await evaluate(
            "history.forward();setTimeout(()=>history.back(),20);setTimeout(()=>history.forward(),40);return true",
          )
          await at("/b")
          await browser("wait", "850")
          await check(
            "location.pathname==='/b' && document.body.dataset.slug==='b'",
            "last traversal wins",
          )
        },
      )
      await t.test(
        "superseded DOM morph cannot push history, announce, or overwrite source scroll",
        async () => {
          await open()
          await scroll(2000)
          await evaluate(`window.beforeLength=history.length;
          const observer=new MutationObserver(()=>{
            if(document.body.dataset.slug!=='b')return;
            observer.disconnect();void spaNavigate(new URL('/heavy',location.href));
          });observer.observe(document.body,{attributes:true,attributeFilter:['data-slug']});return true`)
          await nav("/b")
          await at("/heavy")
          await check(
            "history.length===beforeLength+1 && !fixtureNav.some(n=>n.path==='/b')",
            "stale morph has no history/nav side effects",
          )
          await browser("back")
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
        },
      )
      await t.test(
        "busy navigation retains at most one restore observer and no idle correction work",
        async () => {
          await open()
          await scroll(2000)
          await evaluate(`void spaNavigate(new URL('/slow',location.href));
          setTimeout(()=>spaNavigate(new URL('/heavy',location.href)),20);
          setTimeout(()=>spaNavigate(new URL('/a#heading',location.href)),40);
          setTimeout(()=>spaNavigate(new URL('/b',location.href)),60);return true`)
          await at("/b")
          await check(
            "fixtureRestoreWork.live<=1 && fixtureRestoreWork.max<=1",
            "busy navigation does not accumulate restore observers",
          )
          await browser("wait", "2000")
          await evaluate(
            "window.idleScrollCalls=fixtureRestoreWork.scrollCalls;return fixtureRestoreWork",
          )
          await browser("wait", "400")
          await check(
            "fixtureRestoreWork.live===0 && fixtureRestoreWork.scrollCalls===idleScrollCalls",
            "finite restore leaves no observer or repeated idle scrolling",
          )
          const work = await evaluate("return fixtureRestoreWork")
          console.log("busy navigation restore work", work.trim())
        },
      )
      await t.test(
        "bounded correction handles delayed growth; user wheel/touch/key cancels",
        async () => {
          await open("/grow")
          await browser("wait", "450")
          await scroll(3000)
          await nav("/b")
          await at("/b")
          await browser("back")
          await at("/grow")
          await wait("Math.abs(scrollY-3000)<=2")
          for (const input of [
            "new WheelEvent('wheel')",
            "new Event('touchstart')",
            "new KeyboardEvent('keydown',{key:'PageDown'})",
          ]) {
            await nav("/a#heading")
            await at("/a")
            await evaluate(`dispatchEvent(${input});scrollTo(0,400);return true`)
            await browser("wait", "1900")
            await check("Math.abs(scrollY-400)<=2", "user input cancels correction")
            await nav("/b")
            await at("/b")
          }
        },
      )
      await t.test(
        "fixed-body drawer capture and popstate order preserve the real source position",
        async () => {
          await open()
          await scroll(2000)
          await browser("click", "[data-reading-drawer]")
          await check("document.body.style.position==='fixed' && scrollY===0", "body really locked")
          await browser("click", "#drawer-b")
          await at("/b")
          await browser("back")
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
          await browser("forward")
          await at("/b")
          await scroll(70)
          await browser("click", "[data-reading-drawer]")
          await browser("back")
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
          await browser("forward")
          await at("/b")
          await wait("Math.abs(scrollY-70)<=2")
        },
      )
      await t.test(
        "native navigation/reload survive documents; bfcache event never replays hashes/top",
        async () => {
          await open()
          await scroll(2000)
          await evaluate("window.oldDocument=crypto.randomUUID();return true")
          await nav("/native")
          await at("/native")
          await check(
            "typeof oldDocument==='undefined'",
            "native budget caused a real document load",
          )
          await browser("back")
          await at("/a")
          await wait("Math.abs(scrollY-2000)<=2")
          console.log(
            "native back lifecycle",
            await evaluate(
              "return {shows:fixtureShows,navigation:performance.getEntriesByType('navigation').map(n=>({type:n.type,notRestoredReasons:n.notRestoredReasons}))}",
            ),
          )
          await scroll(2500)
          await browser("reload")
          await wait("Math.abs(scrollY-2500)<=2")
          await nav("/a#heading")
          await wait("location.hash==='#heading'")
          await scroll(2900)
          await evaluate(
            "dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return fixtureShows",
          )
          await browser("wait", "1900")
          await check("Math.abs(scrollY-2900)<=2", "persisted hash pages keep viewport")
          const shows = await evaluate(
            "return {shows:fixtureShows,navigation:performance.getEntriesByType('navigation').map(n=>n.type)}",
          )
          console.log("bfcache observation", shows.trim())
        },
      )
      await browser("errors")
    } finally {
      await browser("close").catch(() => {})
      await new Promise<void>((done) => server.close(() => done()))
    }
  },
)
