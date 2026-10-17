import { loadSearchEngine, type SearchEngine } from "../../util/search/engine"
import type { SearchRequest, SearchResponse } from "../../util/search/protocol"

type SearchPort = {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null
  postMessage: (response: SearchResponse) => void
}

// The same message handler is exercised directly in unit tests and bundled for browsers.
export function installSearchWorker(port: SearchPort, fetcher: typeof fetch = fetch) {
  let engine: SearchEngine | undefined
  let generation = 0
  port.onmessage = (event) => {
    const request = event.data
    if (!request || !Number.isSafeInteger(request.id)) return
    const handle = async () => {
      if (request.type === "init") {
        const token = ++generation
        engine = undefined
        const next = await loadSearchEngine(request.manifest, request.manifestUrl, fetcher)
        if (token !== generation) return
        engine = next
        port.postMessage({ type: "ready", id: request.id })
      } else if (request.type === "search") {
        if (!engine) throw new Error("Search index is not ready")
        if (typeof request.query !== "string") throw new Error("Invalid search query")
        port.postMessage({
          type: "result",
          id: request.id,
          hits: engine.search(request.query, request.limit),
        })
      }
    }
    void handle().catch((error) =>
      port.postMessage({
        type: "error",
        id: request.id,
        message: error instanceof Error ? error.message : "Search worker failed",
      }),
    )
  }
}

if (typeof document === "undefined" && typeof self !== "undefined") {
  installSearchWorker(self as unknown as SearchPort)
}
