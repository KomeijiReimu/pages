{
  type IdleDeadlineLike = {
    timeRemaining: () => number
    didTimeout?: boolean
  }

  type IdleCallbackHandle = number
  type IdleCallback = (deadline: IdleDeadlineLike) => void

  const hydrateQueue: HTMLElement[] = []
  const dehydrateQueue: HTMLElement[] = []
  const sourceCache = new WeakMap<HTMLElement, string[]>()
  const chunkCache = new WeakMap<HTMLElement, string[][]>()

  let queued = new WeakSet<HTMLElement>()
  let queuedForDehydrate = new WeakSet<HTMLElement>()
  let eligibleForHydrate = new WeakSet<HTMLElement>()
  let outsideRecycleRange = new WeakSet<HTMLElement>()
  let hydrateObserver: IntersectionObserver | undefined
  let recycleObserver: IntersectionObserver | undefined
  let longTaskObserver: PerformanceObserver | undefined
  let idleHandle: IdleCallbackHandle | undefined
  let scrollStopTimer: number | undefined
  let resizeStopTimer: number | undefined
  let deferredWorkTimer: number | undefined
  let userIsScrolling = false
  let viewportIsChanging = false
  let isHugeCodePage = false
  let lastScrollAt = 0
  let lastKnownScrollY = 0
  let backoffUntil = 0

  const idle =
    window.requestIdleCallback ??
    ((cb: IdleCallback) =>
      window.setTimeout(() => cb({ timeRemaining: () => 18, didTimeout: true }), 120))
  const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout

  function getCode(pre: HTMLElement): HTMLElement | null {
    return pre.querySelector(":scope > code")
  }

  function parseClipboardSource(code: HTMLElement): string | undefined {
    if (!code.dataset.clipboard) return undefined
    try {
      const source = JSON.parse(code.dataset.clipboard)
      return typeof source === "string" ? source : undefined
    } catch {
      return undefined
    }
  }

  function getSourceLines(pre: HTMLElement): string[] {
    const cached = sourceCache.get(pre)
    if (cached) return cached

    const code = getCode(pre)
    const source = code
      ? (parseClipboardSource(code) ??
        [...code.querySelectorAll<HTMLElement>(":scope > [data-line]")]
          .map((line) => line.textContent ?? "")
          .join("\n") ??
        code.textContent ??
        "")
      : ""
    const lines = source.replace(/\n$/, "").split("\n")
    sourceCache.set(pre, lines.length > 0 ? lines : [""])
    return sourceCache.get(pre)!
  }

  function makePlainLine(text: string): HTMLSpanElement {
    const line = document.createElement("span")
    line.dataset.line = ""
    line.textContent = text
    return line
  }

  function makePlainFragment(lines: string[]): DocumentFragment {
    const fragment = document.createDocumentFragment()
    for (const line of lines) fragment.append(makePlainLine(line))
    return fragment
  }

  function lineElements(code: HTMLElement): HTMLElement[] {
    return [...code.querySelectorAll<HTMLElement>(":scope > [data-line]")]
  }

  function ensurePlainLineElements(pre: HTMLElement, code: HTMLElement) {
    if (lineElements(code).length > 0) return
    const lines = getSourceLines(pre)
    code.textContent = ""
    code.append(makePlainFragment(lines))
  }

  function replaceLineRange(
    code: HTMLElement,
    start: number,
    removeCount: number,
    fragment: DocumentFragment,
  ) {
    const lines = lineElements(code)
    const first = lines[start]
    if (!first) {
      code.append(fragment)
      return
    }

    const range = document.createRange()
    range.setStartBefore(first)
    const last = lines[Math.min(start + removeCount - 1, lines.length - 1)]
    range.setEndAfter(last ?? first)
    range.deleteContents()
    range.insertNode(fragment)
    range.detach()
  }

  function highlightChunks(pre: HTMLElement): string[][] {
    const cached = chunkCache.get(pre)
    if (cached) return cached

    const script = pre.querySelector<HTMLScriptElement>(":scope > script[data-komei-code-chunks]")
    if (!script?.textContent) {
      chunkCache.set(pre, [])
      return []
    }

    try {
      const decoder = document.createElement("textarea")
      decoder.innerHTML = script.textContent
      const chunks = JSON.parse(decoder.value)
      chunkCache.set(pre, Array.isArray(chunks) ? chunks : [])
    } catch {
      chunkCache.set(pre, [])
    }
    return chunkCache.get(pre)!
  }

  function chunkCount(pre: HTMLElement): number {
    return Number(pre.dataset.komeiCodeChunkCount ?? "0")
  }

  function hydratedChunkCount(pre: HTMLElement): number {
    return Number(pre.dataset.komeiHydratedChunks ?? "0")
  }

  function setHydratedChunkCount(pre: HTMLElement, count: number) {
    pre.dataset.komeiHydratedChunks = String(count)
    pre.dataset.komeiCodeHydrated =
      count >= chunkCount(pre) && chunkCount(pre) > 0 ? "true" : "false"
    if (pre.dataset.komeiOriginalTabindex !== undefined) {
      pre.tabIndex = count > 0 ? Number(pre.dataset.komeiOriginalTabindex) : -1
    }
  }

  function hydrateChunk(pre: HTMLElement): boolean {
    const code = getCode(pre)
    if (!code) return false
    ensurePlainLineElements(pre, code)

    const index = hydratedChunkCount(pre)
    const chunk = highlightChunks(pre)[index]
    if (!chunk) {
      if (chunkCount(pre) === 0) setHydratedChunkCount(pre, 0)
      pre.removeAttribute("aria-hidden")
      return false
    }

    const chunkSize = Number(pre.dataset.komeiCodeChunkSize ?? "12")
    const start = index * chunkSize
    const fragment = document.createDocumentFragment()
    const template = document.createElement("template")
    template.innerHTML = chunk.join("")
    for (const child of [...template.content.children]) {
      fragment.append(child)
    }
    replaceLineRange(code, start, chunk.length, fragment)
    code.removeAttribute("aria-hidden")
    setHydratedChunkCount(pre, index + 1)
    pre.removeAttribute("aria-hidden")
    return index + 1 < chunkCount(pre)
  }

  function dehydrateChunk(pre: HTMLElement): boolean {
    const code = getCode(pre)
    const count = hydratedChunkCount(pre)
    if (!code || count <= 0) return false

    const index = count - 1
    const chunkSize = Number(pre.dataset.komeiCodeChunkSize ?? "12")
    const start = index * chunkSize
    const lineCount = Math.min(chunkSize, Math.max(0, getSourceLines(pre).length - start))
    const sourceLines = getSourceLines(pre).slice(start, start + lineCount)
    replaceLineRange(code, start, lineCount, makePlainFragment(sourceLines))
    setHydratedChunkCount(pre, index)
    return index > 0
  }

  function enqueue(pre: HTMLElement) {
    if (queued.has(pre) || hydratedChunkCount(pre) >= chunkCount(pre)) return
    queued.add(pre)
    hydrateQueue.push(pre)
    scheduleWork()
  }

  function enqueueDehydrate(pre: HTMLElement) {
    if (queuedForDehydrate.has(pre) || hydratedChunkCount(pre) <= 0) return
    queuedForDehydrate.add(pre)
    dehydrateQueue.push(pre)
    scheduleWork()
  }

  function scheduleWork() {
    if (idleHandle !== undefined) return
    idleHandle = idle(processQueue)
  }

  function scheduleDeferredWork(delay = 260) {
    if (deferredWorkTimer !== undefined) return
    deferredWorkTimer = window.setTimeout(() => {
      deferredWorkTimer = undefined
      scheduleWork()
    }, delay)
  }

  function shouldYield(deadline: IdleDeadlineLike, startedAt: number) {
    if (userIsScrolling || viewportIsChanging || document.visibilityState === "hidden") return true
    if (isHugeCodePage && performance.now() < backoffUntil) return true
    if (isHugeCodePage && window.scrollY !== lastKnownScrollY) {
      lastKnownScrollY = window.scrollY
      lastScrollAt = performance.now()
      return true
    }
    if (isHugeCodePage && performance.now() - lastScrollAt < 2200) return true
    if (!deadline.didTimeout && deadline.timeRemaining() < (isHugeCodePage ? 4 : 8)) return true
    return isHugeCodePage && performance.now() - startedAt > 4
  }

  function processQueue(deadline: IdleDeadlineLike) {
    idleHandle = undefined

    const startedAt = performance.now()
    if (shouldYield(deadline, startedAt)) {
      scheduleDeferredWork(isHugeCodePage ? 360 : 160)
      return
    }

    const dehydrateCandidate = dehydrateQueue.shift()
    if (dehydrateCandidate) {
      queuedForDehydrate.delete(dehydrateCandidate)
      if (dehydrateCandidate.isConnected && outsideRecycleRange.has(dehydrateCandidate)) {
        if (dehydrateChunk(dehydrateCandidate) && outsideRecycleRange.has(dehydrateCandidate)) {
          enqueueDehydrate(dehydrateCandidate)
        }
      }
      if (hydrateQueue.length > 0 || dehydrateQueue.length > 0) {
        scheduleWork()
      }
      return
    }

    const pre = hydrateQueue.shift()
    if (pre) {
      queued.delete(pre)
      if (pre.isConnected && eligibleForHydrate.has(pre)) {
        if (hydrateChunk(pre) && eligibleForHydrate.has(pre)) enqueue(pre)
      }
    }

    if (hydrateQueue.length > 0 || dehydrateQueue.length > 0) scheduleWork()
  }

  function onScroll() {
    userIsScrolling = true
    lastScrollAt = performance.now()
    lastKnownScrollY = window.scrollY
    window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(
      () => {
        userIsScrolling = false
        scheduleWork()
      },
      isHugeCodePage ? 900 : 360,
    )
  }

  function onResize() {
    viewportIsChanging = true
    window.clearTimeout(resizeStopTimer)
    resizeStopTimer = window.setTimeout(
      () => {
        viewportIsChanging = false
        scheduleWork()
      },
      isHugeCodePage ? 760 : 420,
    )
  }

  function setupLongTaskObserver() {
    longTaskObserver?.disconnect()
    if (!("PerformanceObserver" in window)) return
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) {
            backoffUntil = performance.now() + Math.min(5000, entry.duration * 20)
            scheduleDeferredWork(900)
            break
          }
        }
      })
      longTaskObserver.observe({ entryTypes: ["longtask"] })
    } catch {
      longTaskObserver = undefined
    }
  }

  document.addEventListener("nav", () => {
    hydrateObserver?.disconnect()
    recycleObserver?.disconnect()
    longTaskObserver?.disconnect()
    if (idleHandle !== undefined) {
      cancelIdle(idleHandle)
      idleHandle = undefined
    }
    window.clearTimeout(deferredWorkTimer)
    deferredWorkTimer = undefined
    hydrateQueue.length = 0
    dehydrateQueue.length = 0
    queued = new WeakSet<HTMLElement>()
    queuedForDehydrate = new WeakSet<HTMLElement>()
    eligibleForHydrate = new WeakSet<HTMLElement>()
    outsideRecycleRange = new WeakSet<HTMLElement>()
    backoffUntil = 0

    const blocks = [...document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")]
    isHugeCodePage = false
    document.body.classList.remove("komei-large-code-page")
    if (blocks.length === 0) return
    isHugeCodePage = blocks.length >= 160 || document.body.scrollHeight > 120_000
    lastScrollAt = isHugeCodePage ? performance.now() : 0
    lastKnownScrollY = window.scrollY
    document.body.classList.toggle("komei-large-code-page", isHugeCodePage)
    if (isHugeCodePage) setupLongTaskObserver()

    hydrateObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pre = entry.target as HTMLElement
          if (entry.isIntersecting) {
            eligibleForHydrate.add(pre)
            enqueue(pre)
          } else {
            eligibleForHydrate.delete(pre)
          }
        }
      },
      { rootMargin: isHugeCodePage ? "240px 0px" : "600px 0px" },
    )

    recycleObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pre = entry.target as HTMLElement
          if (entry.isIntersecting) {
            outsideRecycleRange.delete(pre)
          } else {
            outsideRecycleRange.add(pre)
            enqueueDehydrate(pre)
          }
        }
      },
      { rootMargin: isHugeCodePage ? "1200px 0px" : "2200px 0px" },
    )

    for (const block of blocks) {
      block.dataset.komeiHydratedChunks = "0"
      hydrateObserver.observe(block)
      recycleObserver.observe(block)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    window.addCleanup(() => {
      hydrateObserver?.disconnect()
      recycleObserver?.disconnect()
      longTaskObserver?.disconnect()
      hydrateObserver = undefined
      recycleObserver = undefined
      longTaskObserver = undefined
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      window.clearTimeout(scrollStopTimer)
      window.clearTimeout(resizeStopTimer)
      window.clearTimeout(deferredWorkTimer)
      deferredWorkTimer = undefined
      if (idleHandle !== undefined) {
        cancelIdle(idleHandle)
        idleHandle = undefined
      }
      hydrateQueue.length = 0
      dehydrateQueue.length = 0
      queued = new WeakSet<HTMLElement>()
      queuedForDehydrate = new WeakSet<HTMLElement>()
      eligibleForHydrate = new WeakSet<HTMLElement>()
      outsideRecycleRange = new WeakSet<HTMLElement>()
    })
  })
}
