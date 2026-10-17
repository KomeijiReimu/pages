import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { resolve, sep } from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { emitPublicFixture } from "./fixtures"
import { createTestDirectory } from "../../test/helpers/temp"

const run = promisify(execFile)
test(
  "search backend: real emitted assets, lazy shared Worker and failure retry in headless Chromium",
  {
    skip: process.env.SEARCH_BACKEND_BROWSER !== "1",
    timeout: 120_000,
  },
  async (t) => {
    const fixtureDirectory = await createTestDirectory(t, "pg-sw-")
    await emitPublicFixture(fixtureDirectory)
    const requests: string[] = []
    let missingShard = false
    let corruptWorker = false
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url!, "http://fixture").pathname
      requests.push(pathname)
      const path = resolve(fixtureDirectory, pathname === "/" ? "index.html" : `.${pathname}`)
      if (!path.startsWith(fixtureDirectory + sep)) {
        res.writeHead(403)
        res.end()
        return
      }
      if (missingShard && /\/text\.[a-f0-9]+\.json$/.test(pathname)) {
        missingShard = false
        res.writeHead(404)
        res.end("missing shard")
        return
      }
      try {
        let bytes = await readFile(path)
        if (corruptWorker && /\/worker\.[a-f0-9]+\.js$/.test(pathname)) {
          corruptWorker = false
          bytes = Buffer.from("throw new Error('unverified worker');")
        }
        res.setHeader(
          "content-type",
          path.endsWith(".json")
            ? "application/json"
            : path.endsWith(".js")
              ? "text/javascript"
              : "text/html",
        )
        res.setHeader("content-length", bytes.length)
        res.end(bytes)
      } catch {
        res.writeHead(404)
        res.end("not found")
      }
    })
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const session = `search-backend-${process.pid}`
    const browser = async (...args: string[]) => {
      const result = await run(
        "agent-browser",
        ["--session", session, "--headed", "false", ...args],
        {
          timeout: 35000,
          maxBuffer: 4_000_000,
          env: {
            ...process.env,
            TMPDIR: fixtureDirectory,
            AGENT_BROWSER_RESTORE_SAVE: "never",
          },
        },
      )
      return result.stdout
    }
    const evaluate = (body: string) => browser("eval", `(async()=>{${body}})()`)
    try {
      await browser("open", origin)
      await browser("wait", "--fn", "typeof backendSearch==='function'")
      assert.ok(
        !requests.some((path) => path.startsWith("/static/search/")),
        "no search data is requested at page load",
      )
      await evaluate(`window.workerCount=0;window.terminationCount=0;const NativeWorker=Worker;
      window.Worker=class extends NativeWorker{constructor(...args){super(...args);workerCount++}terminate(){terminationCount++;super.terminate()}};
      return {workerCount}`)
      const result =
        await evaluate(`const start=performance.now();const hits=await backendSearch('9111');
      if(!hits[0]||!hits[0].snippet.includes('9111')||hits[0].anchor!=='tail:Case[Exact]')throw Error('missing full-text tail');
      const queries=['中文末尾','alpha omega','LASTCODE_12000','C++','[','#testing 9111','ARIAVISIBLE_SENTINEL'];
      const results=await Promise.all(queries.map(query=>backendSearch(query)));
      if(results.some(hits=>!hits.length)||workerCount!==1)throw Error('missing corpus result or duplicate worker');
      if(!results[0][0].preview.includes('中文末尾检索证据')||results[0][0].anchor!=='tail:Case[Exact]')throw Error('CJK preview selected intro instead of exact tail phrase');
      return {firstSearchAndQueriesMs:performance.now()-start,workerCount,mainThreadHeapBytes:performance.memory?.usedJSHeapSize,hits,cjkHit:results[0][0],queries:queries.map((q,i)=>({query:q,slug:results[i][0].slug,snippet:results[i][0].snippet}))}`)
      console.log("Full-text/lazy Worker evidence:", result.trim())
      assert.equal(requests.filter((path) => path.endsWith("manifest.json")).length, 1)
      const manifest = JSON.parse(
        await readFile(resolve(fixtureDirectory, "static/search/manifest.json"), "utf8"),
      )
      assert.equal(
        requests.filter((path) => /\/text\.[a-f0-9]+\.json$/.test(path)).length,
        manifest.shards.length,
      )
      missingShard = true
      const failed =
        await evaluate(`backendReset();try{await backendSearch('9111');throw Error('expected shard failure')}catch(error){
      if(!String(error).includes('404'))throw error;return {error:String(error),workerCount,terminationCount}}`)
      console.log("Shard failure evidence:", failed.trim())
      await evaluate(
        "const hits=await backendSearch('LASTCODE_12000');if(!hits.length)throw Error('retry failed');return {workerCount,terminationCount}",
      )
      corruptWorker = true
      const rejected =
        await evaluate(`backendReset();const previous=workerCount;try{await backendSearch('9111');throw Error('expected integrity failure')}catch(error){
      if(!String(error).includes('hash')||previous!==workerCount)throw error;return {error:String(error),workerCount,terminationCount}}`)
      console.log("Worker integrity evidence:", rejected.trim())
      await evaluate(
        "if(!(await backendSearch('中文末尾')).length)throw Error('integrity retry failed');return {workerCount,terminationCount}",
      )
      assert.ok(
        !requests.some((path) => path.startsWith("/public/") || path.endsWith("contentIndex.json")),
        "no document HTML/legacy summary fetch",
      )
      await browser("errors")
    } finally {
      await browser("close").catch(() => {})
      await new Promise<void>((done) => server.close(() => done()))
    }
  },
)
