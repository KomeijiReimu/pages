import {
  assertManifest,
  fetchAsset,
  isSearchHit,
  searchManifestPath,
  type SearchHit,
  type SearchRequest,
  type SearchResponse,
} from "../../util/search/protocol"

export type SearchWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>
type ClientOptions = {
  manifestUrl?: string
  fetcher?: typeof fetch
  workerFactory?: (source: Uint8Array) => { worker: SearchWorker; dispose: () => void }
  timeoutMs?: number
}

export function createSearchClient(options: ClientOptions = {}) {
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  let generation = 0
  let nextId = 0
  let worker: SearchWorker | undefined
  let dispose: (() => void) | undefined
  let controller: AbortController | undefined
  let initialization: Promise<void> | undefined
  let rejectInitialization: ((error: Error) => void) | undefined
  let initializationTimer: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<
    number,
    {
      resolve: (message: SearchResponse) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  function reset(error = new Error("Search client was reset")) {
    generation++
    controller?.abort()
    clearTimeout(initializationTimer)
    rejectInitialization?.(error)
    rejectInitialization = undefined
    initialization = undefined
    worker?.terminate()
    worker = undefined
    dispose?.()
    dispose = undefined
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
  }

  function send(message: SearchRequest): Promise<SearchResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reset(new Error("Search worker timed out")),
        options.timeoutMs ?? 30_000,
      )
      pending.set(message.id, { resolve, reject, timer })
      try {
        worker!.postMessage(message)
      } catch {
        reset(new Error("Search worker could not accept the request"))
      }
    })
  }

  function ready(): Promise<void> {
    if (initialization) return initialization
    const token = generation
    controller = new AbortController()
    const signal = controller.signal
    initialization = new Promise<void>((resolve, reject) => {
      rejectInitialization = reject
      initializationTimer = setTimeout(
        () => reset(new Error("Search initialization timed out")),
        options.timeoutMs ?? 60_000,
      )
      const initialize = async () => {
        const manifestUrl = options.manifestUrl ?? new URL(searchManifestPath, location.href).href
        const response = await fetcher(manifestUrl, { cache: "no-cache", signal })
        if (!response.ok) throw new Error(`Search manifest request failed (${response.status})`)
        const manifest: unknown = await response.json()
        assertManifest(manifest)
        const source = await fetchAsset(manifest.worker, manifestUrl, (input, init) =>
          fetcher(input, { ...init, signal }),
        )
        if (token !== generation) return
        const factory =
          options.workerFactory ??
          ((bytes: Uint8Array) => {
            const url = URL.createObjectURL(
              new Blob([new Uint8Array(bytes)], { type: "text/javascript" }),
            )
            try {
              return { worker: new Worker(url), dispose: () => URL.revokeObjectURL(url) }
            } catch (error) {
              URL.revokeObjectURL(url)
              throw error
            }
          })
        const created = factory(source)
        worker = created.worker
        dispose = created.dispose
        worker.onmessage = (event: MessageEvent<unknown>) => {
          if (token !== generation) return
          const response = event.data as SearchResponse
          if (!response || !Number.isSafeInteger(response.id))
            return reset(new Error("Invalid search worker response"))
          const item = pending.get(response.id)
          if (!item) return
          if (response.type === "error") return reset(new Error(response.message))
          if (
            response.type !== "ready" &&
            (response.type !== "result" ||
              !Array.isArray(response.hits) ||
              !response.hits.every(isSearchHit))
          )
            return reset(new Error("Invalid search worker result"))
          clearTimeout(item.timer)
          pending.delete(response.id)
          item.resolve(response)
        }
        worker.onerror = () => {
          if (token === generation) reset(new Error("Search worker crashed"))
        }
        worker.onmessageerror = () => {
          if (token === generation) reset(new Error("Search worker message failed"))
        }
        const answer = await send({ type: "init", id: ++nextId, manifest, manifestUrl })
        if (answer.type !== "ready") throw new Error("Search initialization did not complete")
        if (token !== generation) return
        clearTimeout(initializationTimer)
        rejectInitialization = undefined
        resolve()
      }
      void initialize().catch((error) => {
        if (token === generation)
          reset(error instanceof Error ? error : new Error("Search initialization failed"))
      })
    })
    return initialization
  }

  return {
    async searchDocuments(query: string, limit?: number): Promise<SearchHit[]> {
      if (!query.trim()) return []
      const token = generation
      await ready()
      if (token !== generation) throw new Error("Search request was reset")
      const answer = await send({ type: "search", id: ++nextId, query, limit })
      if (answer.type !== "result") throw new Error("Search query did not complete")
      return answer.hits
    },
    resetSearchClient: () => reset(),
  }
}

const sharedClient = createSearchClient()
export const searchDocuments = sharedClient.searchDocuments
export const resetSearchClient = sharedClient.resetSearchClient
