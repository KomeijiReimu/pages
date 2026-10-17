import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { buildSearchAssets } from "./build"
import { SearchEngine, loadSearchEngine } from "./engine"
import { searchEncoder } from "./encoder"
import {
  assertManifest,
  assertShard,
  sha256,
  type SearchManifest,
  type SearchDocument,
  type SearchRequest,
  type SearchResponse,
} from "./protocol"
import { createSearchClient, type SearchWorker } from "../../components/scripts/searchClient"
import { installSearchWorker } from "../../components/scripts/search.worker"
import { emitPublicFixture, fixtureDirectory, syntheticDocuments } from "./fixtures"

const manifestUrl = "http://fixture.test/static/search/manifest.json"
const docs = syntheticDocuments()
const assetsPromise = buildSearchAssets(docs, 1000)
const fixturePromise = emitPublicFixture()

async function fixtureFetcher() {
  const assets = await assetsPromise
  const files = new Map(assets.files)
  const requests: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    requests.push(url.pathname)
    const body = files.get(url.pathname.split("/").at(-1)!)
    return body === undefined
      ? new Response("missing", { status: 404 })
      : new Response(typeof body === "string" ? body : new Uint8Array(body))
  }
  return { assets, files, requests, fetcher }
}

class InProcessWorker {
  onmessage: SearchWorker["onmessage"] = null
  onerror: SearchWorker["onerror"] = null
  onmessageerror: SearchWorker["onmessageerror"] = null
  terminated = false
  silenceQueries = false
  readonly port: Parameters<typeof installSearchWorker>[0]
  constructor(fetcher: typeof fetch) {
    this.port = {
      onmessage: null,
      postMessage: (data) =>
        queueMicrotask(() => {
          if (!this.terminated)
            (this.onmessage as ((event: MessageEvent) => void) | null)?.({ data } as MessageEvent)
        }),
    }
    installSearchWorker(this.port, fetcher)
  }
  postMessage(data: SearchRequest) {
    if (this.silenceQueries && data.type === "search") return
    queueMicrotask(() => this.port.onmessage?.({ data } as MessageEvent<SearchRequest>))
  }
  terminate() {
    this.terminated = true
  }
  crash() {
    ;(this.onerror as ((event: ErrorEvent) => void) | null)?.({} as ErrorEvent)
  }
}

test("search emitter publishes full HAST text and immutable worker/shards without changing metadata", async () => {
  const fixture = await fixturePromise
  const manifest: SearchManifest = JSON.parse(
    await readFile(resolve(fixtureDirectory, "static/search/manifest.json"), "utf8"),
  )
  assertManifest(manifest)
  const texts = await Promise.all(
    manifest.shards.map(async (shard) => {
      const bytes = new Uint8Array(
        await readFile(resolve(fixtureDirectory, "static/search", shard.url)),
      )
      assert.equal(await sha256(bytes), shard.sha256)
      const parsed = JSON.parse(new TextDecoder().decode(bytes))
      assertShard(parsed, manifest, shard.documents)
      return parsed.documents[0].text as string
    }),
  )
  assert.match(texts.join(""), /LASTCODE_12000/)
  assert.match(texts.join(""), /omega 9111 中文末尾检索证据 & <literal>/)
  assert.doesNotMatch(
    texts.join(""),
    /SCRIPTSECRET|STYLESECRET|TEMPLATESECRET|SHIKISECRET|UNPUBLISHED_SECRET|already &lt;escaped&gt;/,
  )
  const metadata = JSON.parse(
    await readFile(resolve(fixtureDirectory, "static/contentIndex.json"), "utf8"),
  )
  assert.equal(metadata["public/large"].content.length, 8000)
  assert.deepEqual(metadata["public/large"].links, [])
  assert.deepEqual(metadata["public/large"].tags, ["testing", "编程"])
  assert.ok(
    !fixture.clientInputs.some((path) => /flexsearch|search\/engine/.test(path)),
    "main-thread client contains no indexing engine",
  )
  assert.equal(fixture.emitted.at(-1), resolve(fixtureDirectory, "static/search/manifest.json"))
  console.log("emitter build evidence", {
    buildMs: fixture.buildMs,
    publishedDocuments: manifest.documents,
    fixtureDirectory,
  })
})

test("search engine retrieves tail/CJK/cross-paragraph/code, keeps tag semantics and literal snippets", () => {
  const engine = new SearchEngine(docs)
  assert.equal(engine.search("9111")[0].slug, "public/title", "title matches precede content")
  for (const query of ["9111", "中文末尾", "alpha omega", "LASTCODE_12000", "C++", "["]) {
    const hit = engine.search(query).find((hit) => hit.slug === "public/large")
    assert.ok(hit, query)
    assert.ok(hit.preview.length <= 900)
    assert.ok(hit.snippet.length <= 200)
    if (query === "LASTCODE_12000") {
      assert.match(hit.snippet, /LASTCODE_12000/)
      assert.ok(hit.snippet.length >= 160)
      assert.ok(hit.preview.length >= 600)
    }
  }
  const hit = engine.search("9111").find((hit) => hit.slug === "public/large")!
  assert.equal(hit.anchor, "tail:Case[Exact]")
  assert.match(hit.preview, /& <literal>/)
  assert.equal(hit.title, "<img src=x onerror=alert(1)> Corpus")
  assert.deepEqual(
    engine.search("#testing").map((hit) => hit.slug),
    ["public/large"],
  )
  assert.deepEqual(
    engine.search("#testing 9111").map((hit) => hit.slug),
    ["public/large"],
  )
  assert.deepEqual(engine.search("#other LASTCODE_12000"), [])
  assert.equal(engine.search("9111", 1).length, 1)
  assert.deepEqual(searchEncoder("C++ [ 中文"), ["c++", "[", "中", "文"])
})

test("search corpus validates every shard before returning an index; schema/version/hash/missing fail explicitly", async () => {
  const f = await fixtureFetcher()
  const manifest = f.assets.manifest
  assert.equal(manifest.shards.length, 2)
  assert.ok(
    (await loadSearchEngine(manifest, manifestUrl, f.fetcher)).search("LASTCODE_12000").length,
  )
  assert.equal(f.requests.length, 2)
  assert.throws(() => assertManifest({ ...manifest, schemaVersion: 2 }), /schema/)
  assert.throws(
    () => assertManifest({ ...manifest, shards: manifest.shards.slice(1) }),
    /Incomplete/,
  )
  assert.throws(
    () =>
      assertManifest({
        ...manifest,
        worker: { ...manifest.worker, url: "https://evil.test/w.js" },
      }),
    /schema/,
  )
  const missing = manifest.shards[1]
  f.files.delete(missing.url)
  await assert.rejects(loadSearchEngine(manifest, manifestUrl, f.fetcher), /404/)
  f.files.set(missing.url, "corrupt")
  await assert.rejects(loadSearchEngine(manifest, manifestUrl, f.fetcher), /hash/)
  const wrongVersion = { schemaVersion: 1, contentVersion: "0".repeat(64), documents: [docs[1]] }
  assert.throws(() => assertShard(wrongVersion, manifest, 1), /version/)
  assert.throws(
    () =>
      assertShard(
        {
          schemaVersion: 1,
          contentVersion: manifest.contentVersion,
          documents: [{ ...docs[1], headings: [{ id: "x", start: -1, end: 99 }] }],
        },
        manifest,
        1,
      ),
    /offsets/,
  )
})

test("search client shares one lazy worker, retries failed initialization, and reset rejects pending", async () => {
  const f = await fixtureFetcher()
  const workers: InProcessWorker[] = []
  let fail = true
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("manifest.json") && fail) {
      fail = false
      return new Response("failed", { status: 503 })
    }
    return f.fetcher(input, init)
  }
  const client = createSearchClient({
    manifestUrl,
    fetcher,
    timeoutMs: 1000,
    workerFactory: () => {
      const worker = new InProcessWorker(f.fetcher)
      workers.push(worker)
      return { worker: worker as unknown as SearchWorker, dispose() {} }
    },
  })
  assert.equal(workers.length, 0)
  assert.equal(f.requests.length, 0)
  await assert.rejects(client.searchDocuments("9111"), /503/)
  const results = await Promise.all([
    client.searchDocuments("LASTCODE_12000"),
    client.searchDocuments("中文末尾"),
  ])
  assert.ok(results.every((hits) => hits.length))
  assert.equal(workers.length, 1)
  workers[0].silenceQueries = true
  const pending = client.searchDocuments("9111")
  await new Promise((resolve) => setImmediate(resolve))
  client.resetSearchClient()
  await assert.rejects(pending, /reset/)
  assert.ok(workers[0].terminated)
  assert.ok((await client.searchDocuments("9111")).length)
  assert.equal(workers.length, 2)
  client.resetSearchClient()
})

test("search worker/client crashes, timeouts and invalid worker hashes reject, then can retry", async () => {
  const f = await fixtureFetcher()
  const workers: InProcessWorker[] = []
  const client = createSearchClient({
    manifestUrl,
    fetcher: f.fetcher,
    timeoutMs: 100,
    workerFactory: () => {
      const worker = new InProcessWorker(f.fetcher)
      workers.push(worker)
      return { worker: worker as unknown as SearchWorker, dispose() {} }
    },
  })
  await client.searchDocuments("9111")
  workers[0].silenceQueries = true
  const crashed = client.searchDocuments("9111")
  await new Promise((resolve) => setImmediate(resolve))
  workers[0].crash()
  await assert.rejects(crashed, /crashed/)
  await client.searchDocuments("9111")
  workers[1].silenceQueries = true
  await assert.rejects(client.searchDocuments("9111"), /timed out/)
  await client.searchDocuments("9111")
  client.resetSearchClient()
  f.files.set(f.assets.manifest.worker.url, "wrong script")
  await assert.rejects(client.searchDocuments("9111"), /hash/)
  assert.equal(workers.length, 3, "invalid bytes never become an executable Worker")
})

test("actual worker message handler reports shard failure, never a successful empty result", async () => {
  const f = await fixtureFetcher()
  f.files.delete(f.assets.manifest.shards[1].url)
  const messages: SearchResponse[] = []
  let done: () => void = () => {}
  const received = new Promise<void>((resolve) => {
    done = resolve
  })
  const port = {
    onmessage: null as Parameters<typeof installSearchWorker>[0]["onmessage"],
    postMessage(message: SearchResponse) {
      messages.push(message)
      done()
    },
  }
  installSearchWorker(port, f.fetcher)
  port.onmessage!({
    data: { type: "init", id: 1, manifest: f.assets.manifest, manifestUrl },
  } as MessageEvent<SearchRequest>)
  await received
  assert.equal(messages[0].type, "error")
  assert.ok(!messages.some((message) => message.type === "result"))
})

test("search client bounds a hanging manifest and reset prevents a late initialization from creating workers", async () => {
  const f = await fixtureFetcher()
  const never = createSearchClient({
    manifestUrl,
    timeoutMs: 20,
    fetcher: async () => new Promise<Response>(() => {}),
  })
  await assert.rejects(never.searchDocuments("9111"), /initialization timed out/)
  let release: () => void = () => {}
  let gated = true
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let workers = 0
  const client = createSearchClient({
    manifestUrl,
    timeoutMs: 1000,
    fetcher: async (input, init) => {
      if (gated && String(input).endsWith("manifest.json")) await gate
      return f.fetcher(input, init)
    },
    workerFactory: () => {
      workers++
      return { worker: new InProcessWorker(f.fetcher) as unknown as SearchWorker, dispose() {} }
    },
  })
  const pending = client.searchDocuments("9111")
  const rejected = assert.rejects(pending, /reset/)
  await new Promise((resolve) => setImmediate(resolve))
  client.resetSearchClient()
  await rejected
  gated = false
  release()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(workers, 0, "late initialization cannot publish an obsolete Worker")
  assert.ok((await client.searchDocuments("9111")).length)
  assert.equal(workers, 1)
  client.resetSearchClient()
})

test(
  "synthetic full-text corpus build/load/query size and heap observations",
  { skip: process.env.SEARCH_BACKEND_BENCH !== "1" },
  async () => {
    const corpus: SearchDocument[] = Array.from({ length: 2000 }, (_, i) => ({
      ...docs[1],
      slug: `bench/${i}`,
      title: `Document ${i}`,
      text:
        `benchmark${i} ` +
        "public ordinary searchable passage 中文段落 ".repeat(80) +
        ` endword${i}`,
      paragraphs: [],
      headings: [],
    }))
    corpus.push({ ...docs[0], slug: "bench/large" })
    const before = process.memoryUsage().heapUsed
    const buildAt = performance.now()
    const assets = await buildSearchAssets(corpus)
    const buildMs = performance.now() - buildAt
    const fetcher: typeof fetch = async (input) => {
      const body = assets.files.get(new URL(String(input)).pathname.split("/").at(-1)!)!
      return new Response(typeof body === "string" ? body : new Uint8Array(body))
    }
    const loadAt = performance.now()
    const engine = await loadSearchEngine(assets.manifest, manifestUrl, fetcher)
    const loadBuildIndexMs = performance.now() - loadAt
    const queryAt = performance.now()
    const hits = engine.search("LASTCODE_12000")
    const queryMs = performance.now() - queryAt
    assert.equal(hits[0].slug, "bench/large")
    const memory = process.memoryUsage()
    const evidence = {
      documents: corpus.length,
      shards: assets.manifest.shards.length,
      dataBytes: [...assets.files.entries()]
        .filter(([name]) => name.endsWith(".json"))
        .reduce((sum, [, data]) => sum + Buffer.byteLength(data), 0),
      workerBytes: Buffer.byteLength(assets.files.get(assets.manifest.worker.url)!),
      buildMs,
      loadBuildIndexMs,
      queryMs,
      heapBeforeBytes: before,
      heapAfterBytes: memory.heapUsed,
      heapDeltaBytes: memory.heapUsed - before,
      rssAfterBytes: memory.rss,
      processMaxRssKiB: process.resourceUsage().maxRSS,
    }
    await fixturePromise
    await writeFile(
      resolve(fixtureDirectory, "../benchmark.json"),
      JSON.stringify(evidence, null, 2),
    )
    console.log("search benchmark evidence", evidence)
  },
)
