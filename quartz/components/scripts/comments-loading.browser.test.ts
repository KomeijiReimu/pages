import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import { build } from "esbuild"
import { sassPlugin } from "esbuild-sass-plugin"
import { createTestDirectory } from "../../test/helpers/temp"

// Optional isolated Chromium + puppeteer-core. Every response is a synthetic
// fixture, including the cross-origin script and widget. No live GitHub login.
test(
  "family route motion and discussion handoff at reading widths",
  {
    skip: !process.env.CHROME_BIN || !process.env.PUPPETEER_MODULE,
    timeout: 180_000,
  },
  async (t) => {
    const common = { bundle: true, write: false } as const
    const [component, js, css] = await Promise.all([
      build({
        ...common,
        stdin: {
          contents: `
      import { h } from 'preact'; import { renderToString } from 'preact-render-to-string';
      import make from './quartz/components/Comments';
      const C = make({provider:'giscus',options:{repo:'fixture/discussions',repoId:'fixture',category:'Notes',categoryId:'notes',lang:'zh-CN',mapping:'pathname'}});
      export default renderToString(h(C,{cfg:{baseUrl:'fixture.invalid'},fileData:{}}));`,
          resolveDir: process.cwd(),
        },
        loader: { ".scss": "text" },
        plugins: [
          {
            name: "ssr-script-resource",
            setup(b) {
              b.onResolve({ filter: /comments\.inline$/ }, () => ({
                path: "script",
                namespace: "fixture",
              }))
              b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                contents: 'export default ""',
              }))
            },
          },
        ],
        format: "esm",
        platform: "node",
      }),
      build({
        ...common,
        stdin: {
          contents: `import './comments.inline';import './spa.inline'`,
          resolveDir: resolve("quartz/components/scripts"),
        },
        format: "iife",
      }),
      build({
        ...common,
        stdin: {
          contents: `@import './quartz/styles/custom.scss'; @import './quartz/components/styles/comments.scss'; @import './quartz/components/styles/documentFamily.scss';`,
          resolveDir: process.cwd(),
          loader: "css",
        },
        plugins: [sassPlugin()],
        external: ["*.woff2", "*.svg", "*.png"],
      }),
    ])
    const markup = (
      await import(
        `data:text/javascript;base64,${Buffer.from(component.outputFiles[0].text).toString("base64")}`
      )
    ).default
    const site = "http://127.0.0.1:9876"
    const widget = "https://giscus.app"
    const html = (
      path: string,
    ) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title>
    <link data-persist rel="stylesheet" href="/site.css"><script data-persist defer src="/site.js"></script></head>
    <body data-slug="${path.slice(1)}"><div id="quartz-root"><div class="center"><div class="popover-hint">
      ${path === "/ordinary" ? '<div class="page-listing">Directory</div>' : '<div class="kfn-family">Directory <a href="#notes" data-router-ignore>Browse</a></div>'}
      <article id="notes" style="height:8000px">Authored note</article></div><aside hidden><div class="kfn-family">Preview</div></aside>
      <div class="page-footer">${path.startsWith("/family") ? markup : ""}</div></div></div></body></html>`
    const client = `(() => {
    const script=document.currentScript, host=document.querySelector('.giscus');
    window.fixtureClient={...script.dataset,callback:new URL(location.href).searchParams.get('giscus')};
    const f=document.createElement('iframe');f.className='giscus-frame giscus-frame--loading';f.title='Comments';
    f.loading=script.dataset.loading;f.src='${widget}/widget';f.style.cssText='border:0;width:100%;opacity:0';
    f.addEventListener('load',()=>{f.classList.remove('giscus-frame--loading');f.style.opacity='1'});
    host.replaceChildren(f);
  })()`
    const frame = `<!doctype html><button>Write a comment</button><script>addEventListener('message',e=>{if(e.origin==='${site}'&&e.data.giscus?.setConfig)document.body.dataset.theme=e.data.giscus.setConfig.theme})</script>`
    const dir = await createTestDirectory(t, "kfn-ui-")
    const { default: driver } = await import(process.env.PUPPETEER_MODULE!)
    const browser = await driver.launch({
      executablePath: process.env.CHROME_BIN,
      userDataDir: dir,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--host-resolver-rules=MAP * ~NOTFOUND",
      ],
    })
    try {
      for (const width of [390, 1280]) {
        await t.test(
          `${width}px: native lazy frame, failure, SPA, route motion and noscript`,
          async () => {
            const page = await browser.newPage()
            try {
              await page.setViewport({ width, height: 800 })
              let blockClient = false,
                widgetRequests = 0
              await page.setRequestInterception(true)
              page.on(
                "request",
                (r: {
                  url(): string
                  abort(): Promise<void>
                  respond(response: object): Promise<void>
                }) => {
                  const url = new URL(r.url())
                  if (url.href === `${widget}/client.js`)
                    return blockClient
                      ? r.abort()
                      : r.respond({
                          contentType: "application/javascript",
                          headers: { "Access-Control-Allow-Origin": "*" },
                          body: client,
                        })
                  if (url.href === `${widget}/widget`) {
                    widgetRequests++
                    return r.respond({ contentType: "text/html", body: frame })
                  }
                  if (url.origin !== site) return r.abort()
                  if (url.pathname === "/site.js")
                    return r.respond({
                      contentType: "application/javascript",
                      body: js.outputFiles[0].text,
                    })
                  if (url.pathname === "/site.css")
                    return r.respond({ contentType: "text/css", body: css.outputFiles[0].text })
                  if (url.pathname === "/favicon.ico") return r.respond({ status: 204 })
                  return r.respond({ contentType: "text/html", body: html(url.pathname) })
                },
              )
              const ev = (s: string) => page.evaluate(s)
              const wait = (s: string, timeout = 4500) => page.waitForFunction(s, { timeout })
              const nav = (path: string) =>
                ev(`spaNavigate(new URL(${JSON.stringify(path)},location.href))`)
              const style = (sel: string) =>
                ev(
                  `((s)=>[s.animationName,s.animationDuration,s.animationDelay,s.animationTimingFunction])(getComputedStyle(document.querySelector('${sel}')))`,
                )
              const state = (s: string) =>
                `document.querySelector('.komei-comments')?.dataset.state==='${s}'`
              await page.goto(site + "/ordinary")
              await nav("/ordinary-2")
              await nav("/ordinary")
              const reference = await style(".page-listing")
              assert.deepEqual(reference.slice(0, 3), ["komei-route-stage-in", "0.46s", "0.07s"])
              await nav("/family?giscus=fixture-callback")
              assert.deepEqual(await style(".center > .popover-hint > .kfn-family"), reference)
              assert.equal((await style("article"))[0], "none")
              assert.equal((await style("aside .kfn-family"))[0], "none")
              await wait('window.fixtureClient && document.querySelector(".giscus-frame")')
              assert.deepEqual(
                await ev(
                  `[fixtureClient.callback,fixtureClient.loading,fixtureClient.mapping,fixtureClient.emitMetadata]`,
                ),
                ["fixture-callback", "lazy", "pathname", "0"],
              )
              assert.equal(widgetRequests, 0, "far-offscreen frame should remain lazy")
              assert.equal(
                await ev(
                  `${state("loading")} && document.querySelector('[role=status]').checkVisibility()`,
                ),
                true,
              )
              await ev(
                `window.dispatchEvent(new WheelEvent('wheel')); document.documentElement.setAttribute('saved-theme','dark'); document.dispatchEvent(new CustomEvent('themechange',{detail:{theme:'dark'}}));`,
              )
              await page.focus(".komei-comments a")
              await wait(
                `document.querySelector('iframe') && !document.querySelector('.giscus-frame--loading')`,
              )
              const active = await (await page.$("iframe")).contentFrame()
              await active.waitForFunction(`document.body.dataset.theme?.endsWith('/dark.css')`)
              // Frame load (including the browser's error document), unrelated frames and
              // a zero resize are not evidence that the discussion has actually rendered.
              await ev(
                `window.dispatchEvent(new MessageEvent('message',{origin:'${widget}',source:window,data:{giscus:{resizeHeight:100}}}))`,
              )
              await active.evaluate(`parent.postMessage({giscus:{resizeHeight:0}},'${site}')`)
              await wait(state("slow"), 14000)
              assert.equal(
                await ev(`document.querySelector('[role=status]').innerText.includes('较慢')`),
                true,
              )
              await active.evaluate(`parent.postMessage({giscus:{resizeHeight:220}},'${site}')`)
              await wait(state("ready"))
              assert.equal(
                await ev(
                  `document.activeElement===document.querySelector('.komei-comments a') && document.activeElement.checkVisibility()`,
                ),
                true,
              )
              await page.keyboard.press("Tab")
              assert.equal(
                await ev(
                  `document.activeElement===document.querySelector('iframe') && !document.querySelector('.komei-comments__heading').checkVisibility()`,
                ),
                true,
              )
              assert.equal(
                await ev(
                  `document.querySelector('[role=status]').hidden && document.documentElement.scrollWidth<=innerWidth`,
                ),
                true,
              )
              await ev(
                `window.firstFrame=document.querySelector('iframe');document.dispatchEvent(new CustomEvent('nav',{detail:{url:'family'}}));`,
              )
              await nav("/family?giscus=fixture-callback#notes")
              assert.equal(await ev(`document.querySelector('iframe')===window.firstFrame`), true)
              await nav("/ordinary")
              assert.equal(
                await ev(
                  `!window.firstFrame.isConnected && !document.querySelector('.komei-comments')`,
                ),
                true,
              )
              await ev("history.back()")
              await wait(`location.pathname==='/family' && document.body.dataset.slug==='family'`)
              assert.equal((await style(".center > .popover-hint > .kfn-family"))[0], "none")
              blockClient = true
              await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
              await nav("/family-blocked")
              await wait(state("failed"))
              assert.equal((await style(".center > .popover-hint > .kfn-family"))[0], "none")
              assert.equal(
                await ev(
                  `document.querySelector('[role=status]').innerText.includes('未能加载') && document.querySelector('.komei-comments a').checkVisibility() && document.querySelector('.giscus').getAttribute('aria-busy')==='false'`,
                ),
                true,
              )
              await page.setJavaScriptEnabled(false)
              await page.goto(site + "/family")
              assert.deepEqual(
                await ev(
                  `[document.querySelector('noscript').innerText.includes('启用 JavaScript'), document.querySelector('[role=status]').checkVisibility(), document.querySelector('.giscus').checkVisibility(), document.querySelector('.komei-comments a').checkVisibility(), document.querySelector('.komei-comments').dataset.state]`,
                ),
                [true, false, false, true, "pending"],
                "no-JS copy and fallback link, without loading UI",
              )
            } finally {
              await page.close()
            }
          },
        )
      }
    } finally {
      await browser.close()
    }
  },
)
