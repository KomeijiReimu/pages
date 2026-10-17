import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve, sep } from "node:path"
import test from "node:test"
import { promisify } from "node:util"

const run = promisify(execFile)

// Opt-in: builds the actual Quartz bundle and emitter from public synthetic Markdown only.
// SEARCH_UI_BROWSER=1 bun run test quartz/components/scripts/search.browser.test.ts
test(
  "search UI: production bundle, Worker and emitted public fixtures",
  { skip: process.env.SEARCH_UI_BROWSER !== "1", timeout: 420_000 },
  async (t) => {
    const cache = resolve(".quartz-cache/search-ui")
    const content = resolve(cache, "content")
    const output = resolve(cache, "public")
    await mkdir(content, { recursive: true })
    await writeFile(
      `${content}/index.md`,
      "---\ntitle: Search fixture\n---\nPublic search verification.\n",
    )
    await writeFile(
      `${content}/large.md`,
      `---\ntitle: Large reference\ntags: [reference]\n---\n# Opening\n\n${"Public explanatory text. ".repeat(8500)}\n\n## Tail Landing\n\nTailword9111 中文尾部 C++ [ bracket.\n\n\`\`\`text\n${"code filler\n".repeat(1000)}giantCodeTail9111\n\`\`\`\n`,
    )
    await writeFile(
      `${content}/english.md`,
      "---\ntitle: English reference\ntags: [reference]\n---\nEnglish searchable material.\n\n## Another Landing\n\nTailword9111 second result.\n",
    )
    await writeFile(
      `${content}/literal.md`,
      `---\ntitle: ${JSON.stringify('<img src=x onerror="window.searchInjected=1"> Literal')}\ntags: [${JSON.stringify('<svg onload="window.searchInjected=1">')}]\n---\nLiteral C++ [ punctuation. Escaped &lt;script&gt;window.searchInjected=1&lt;/script&gt; text.\n`,
    )
    const rawAnchors = [
      { id: "A%20B", query: "PercentAnchorNeedle" },
      { id: "#lead", query: "HashAnchorNeedle" },
      { id: "中文标题", query: "ChineseAnchorNeedle" },
      { id: "section:part", query: "ColonAnchorNeedle" },
    ]
    await writeFile(
      `${content}/anchors.md`,
      `---\ntitle: Raw anchor fixtures\n---\n${rawAnchors
        .map(
          ({ id, query }) =>
            `<div style="height:1200px"></div>\n\n<h2 id="${id}">${query}</h2>\n\nPublic heading target.\n`,
        )
        .join("\n")}\n<div style="height:1200px"></div>\n`,
    )
    await run(
      "bun",
      ["run", "build", "-d", content, "-o", output, "--include-gitignored", "--concurrency=1"],
      { timeout: 180_000, maxBuffer: 8_000_000 },
    )
    const largePageBytes = (await stat(`${output}/large.html`)).size
    assert.ok(largePageBytes > 160_000)

    let failManifest = false
    let delaySearch = false
    const requests: Array<{ path: string; destination: string | undefined }> = []
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent(new URL(req.url!, "http://fixture").pathname)
      requests.push({ path, destination: req.headers["sec-fetch-dest"] })
      if (path === "/static/search/manifest.json" && failManifest) {
        res.writeHead(503).end("temporary test outage")
        return
      }
      if (delaySearch && path.startsWith("/static/search/")) {
        await new Promise((done) => setTimeout(done, 650))
      }
      let file = resolve(output, `.${path === "/" ? "/index.html" : path}`)
      if (file !== output && !file.startsWith(output + sep)) {
        res.writeHead(403).end()
        return
      }
      try {
        if (!extname(file)) file += ".html"
        const body = await readFile(file)
        const type = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
        }[extname(file)]
        res.setHeader("content-type", type ?? "application/octet-stream")
        res.setHeader("content-length", body.length)
        res.end(body)
      } catch {
        res.writeHead(404).end()
      }
    })
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const session = `search-ui-${process.pid}`
    const evidence: unknown[] = []
    const browser = async (...args: string[]) => {
      const options = {
        timeout: 40_000,
        maxBuffer: 4_000_000,
        env: { ...process.env, TMPDIR: cache, AGENT_BROWSER_RESTORE_SAVE: "never" },
      }
      let result
      try {
        result = await run(
          "agent-browser",
          ["--session", session, "--headed", "false", ...args],
          options,
        )
      } catch (error) {
        const state = await run(
          "agent-browser",
          [
            "--session",
            session,
            "eval",
            "JSON.stringify({url:location.href,ui:document.querySelector('.search-container')?.outerHTML})",
          ],
          options,
        ).catch(() => undefined)
        evidence.push({ failedCommand: args, state: state?.stdout })
        console.error(state?.stdout)
        throw error
      }
      evidence.push({ command: args, stdout: result.stdout, stderr: result.stderr })
      return result.stdout
    }
    const evaluate = (code: string) => browser("eval", `(() => { ${code} })()`)
    const wait = (code: string) => browser("wait", "--fn", code)
    const check = (code: string, message: string) =>
      evaluate(`if (!(${code})) throw Error(${JSON.stringify(message)}); return true`)
    const open = async () => {
      await browser("open", origin + "/")
      await wait(
        "typeof window.spaNavigate === 'function' && document.querySelector('.results-container')",
      )
      await browser("set", "viewport", "1440", "1000")
      await browser("press", "Control+k")
    }
    const fill = (value: string) => browser("fill", ".search-container.active .search-bar", value)
    const settled = () =>
      wait(
        "document.querySelector('.search-container.active .search-layout')?.getAttribute('aria-busy') === 'false' && document.querySelector('.search-container.active a.result-card')",
      )
    const empty = () =>
      check(
        "!document.querySelector('.results-container')?.textContent.trim() && !document.querySelector('.preview-container')?.textContent.trim()",
        "stale results/preview must remain empty",
      )
    try {
      await t.test(
        "large pages preview without HTML fetch, literal and multilingual queries, safe text",
        async () => {
          requests.length = 0
          await open()
          assert.equal(requests.filter((r) => r.path.startsWith("/static/search/")).length, 0)
          const beforeSearch = requests.length
          await fill("Tailword9111")
          await settled()
          await check(
            "document.querySelector('.preview-container').textContent.includes('Tailword9111')",
            "large-page tail has preview",
          )
          await check(
            "[...document.querySelectorAll('a.result-card')].some(a => new URL(a.href).hash === '#tail-landing')",
            "original heading ID retained",
          )
          await browser("hover", "a.result-card:last-child")
          await check(
            "document.querySelector('a.result-card:last-child').classList.contains('focus')",
            "hover selects preview",
          )
          await browser("press", "ArrowDown")
          await check(
            "document.activeElement === document.querySelector('a.result-card')",
            "first ArrowDown focuses first result",
          )
          await browser("press", "ArrowDown")
          await check(
            "document.activeElement === document.querySelector('a.result-card:last-child') && document.activeElement.classList.contains('focus') && document.querySelector('.preview-inner h2').textContent === document.activeElement.querySelector('h3').textContent",
            "arrow focus and preview stay in sync",
          )
          for (const query of ["中文尾部", "English", "C++", "[", "giantCodeTail9111"]) {
            await fill(query)
            await settled()
            await check(
              "document.querySelector('.preview-container .preview-inner')?.textContent.length > 0",
              "query has text preview",
            )
            await check(
              `[...document.querySelectorAll('.preview-inner .highlight')].some(el => el.textContent.toLowerCase() === ${JSON.stringify(query.toLowerCase())})`,
              "literal query highlighted safely",
            )
          }
          await fill("Literal")
          await settled()
          await check(
            "!window.searchInjected && !document.querySelector('.search-layout img, .search-layout svg, .search-layout script') && document.querySelector('.card-title').textContent.includes('<img')",
            "untrusted title remains literal text",
          )
          await fill("#reference")
          await settled()
          await check(
            "document.querySelector('.result-card .tags')?.textContent.includes('#reference')",
            "tag chips retained",
          )
          await fill("#<svg")
          await settled()
          await check(
            "!window.searchInjected && !document.querySelector('.search-layout svg') && document.querySelector('.result-card .tags')?.textContent.includes('<svg')",
            "untrusted tag remains literal text",
          )
          await fill("#reference Tailword9111")
          await settled()
          await check(
            "document.querySelector('.preview-container .highlight')?.textContent.toLowerCase() === 'tailword9111'",
            "tag query highlights content",
          )
          await evaluate(`document.addEventListener('click', event => {
            if (event.ctrlKey && event.target.closest('a.result-card')) event.preventDefault()
          }, {capture:true,once:true});
          document.querySelector('a.result-card').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}));return true`)
          await check(
            "!!document.querySelector('.search-container.active')",
            "modifier click keeps search open",
          )
          assert.deepEqual(
            requests
              .slice(beforeSearch)
              .filter(
                (r) =>
                  r.destination === "empty" &&
                  !r.path.startsWith("/static/search/") &&
                  !r.path.startsWith("/static/contentIndex"),
              ),
            [],
          )
          assert.equal(
            requests.slice(beforeSearch).filter((r) => r.destination === "document").length,
            0,
          )
          await browser("screenshot", `${cache}/desktop.png`)
          await browser("set", "viewport", "390", "844")
          await check(
            "getComputedStyle(document.querySelector('.preview-container')).display === 'none' && document.querySelector('.search-space').getBoundingClientRect().width <= innerWidth",
            "existing mobile layout preserved",
          )
          await browser("screenshot", `${cache}/mobile.png`)
          await evaluate(
            "document.querySelector('.search-bar').dispatchEvent(new CompositionEvent('compositionstart')); return true",
          )
          await fill("中文尾部")
          await empty()
          await evaluate(
            "document.querySelector('.search-bar').dispatchEvent(new CompositionEvent('compositionend')); return true",
          )
          await settled()
          await browser("press", "Escape")
          await browser("press", "Control+Shift+k")
          await check(
            "document.querySelector('.search-container.active .search-bar').value === '#'",
            "tag shortcut retained",
          )
        },
      )
      await t.test(
        "raw heading IDs round-trip once through extractor, Worker and UI navigation",
        async () => {
          for (const { id, query } of rawAnchors) {
            await open()
            await fill(query)
            await settled()
            await check(
              `new URL(document.querySelector('a.result-card').href).hash === ${JSON.stringify("#" + encodeURIComponent(id))} && decodeURIComponent(new URL(document.querySelector('a.result-card').href).hash.slice(1)) === ${JSON.stringify(id)}`,
              `raw heading ID preserved in result URL: ${id}`,
            )
            await browser("click", "a.result-card")
            await wait(
              `document.body.dataset.slug === 'anchors' && decodeURIComponent(location.hash.slice(1)) === ${JSON.stringify(id)} && !!document.getElementById(${JSON.stringify(id)})`,
            )
            await wait(
              `document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().top >= -2 && document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().top <= 160`,
            )
            evidence.push({
              rawAnchor: id,
              landed: await evaluate(
                `return {hash:location.hash,decoded:decodeURIComponent(location.hash.slice(1)),id:document.getElementById(${JSON.stringify(id)}).id,top:document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().top}`,
              ),
            })
          }
        },
      )
      await t.test(
        "initialization failure is not no-match and supports explicit retry",
        async () => {
          failManifest = true
          await open()
          await fill("Tailword9111")
          await wait(
            "document.querySelector('.results-container [role=button]')?.textContent.includes('重试')",
          )
          await check(
            "!document.querySelector('.results-container').textContent.includes('没有找到')",
            "failure is not empty results",
          )
          failManifest = false
          await browser("click", ".results-container [role=button]")
          await settled()
        },
      )
      await t.test(
        "late initialization cannot overwrite newer query, closed/reopened UI or SPA navigation",
        async () => {
          delaySearch = true
          await open()
          await fill("Tailword9111")
          await wait(
            "document.querySelector('.search-layout').getAttribute('aria-busy') === 'true'",
          )
          await browser("wait", "180")
          await fill("English")
          await settled()
          await check(
            "[...document.querySelectorAll('.card-title')].every(e=>e.textContent.includes('English'))",
            "new query wins",
          )
          await open()
          await fill("Tailword9111")
          await browser("wait", "180")
          await browser("press", "Escape")
          await browser("press", "Control+k")
          await browser("wait", "2500")
          await empty()
          await fill("English")
          await settled()
          await open()
          await fill("Tailword9111")
          await browser("wait", "180")
          await evaluate("void spaNavigate(new URL('/english',location.href));return true")
          await wait("document.body.dataset.slug === 'english'")
          await browser("wait", "2500")
          await empty()
          await browser("press", "Control+k")
          await fill("Tailword9111")
          await settled()
          await evaluate("document.querySelector('.search-bar').focus(); return true")
          await browser("press", "Enter")
          await wait("!document.querySelector('.search-container.active')")
          await check("location.pathname !== '/'", "Enter immediately activates a result")
        },
      )
    } finally {
      await writeFile(
        `${cache}/evidence.json`,
        JSON.stringify({ largePageBytes, requests, commands: evidence }, null, 2),
      )
      await browser("close").catch(() => {})
      await new Promise<void>((done) => server.close(() => done()))
    }
  },
)
