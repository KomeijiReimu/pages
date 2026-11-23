{
  type IdleDeadlineLike = {
    timeRemaining: () => number
    didTimeout?: boolean
  }

  type IdleCallbackHandle = number
  type IdleCallback = (deadline: IdleDeadlineLike) => void

  const hydrateQueue: HTMLElement[] = []
  const dehydrateQueue: HTMLElement[] = []
  const imageQueue: HTMLImageElement[] = []
  let sourceCache = new WeakMap<HTMLElement, string[]>()
  let chunkCache = new WeakMap<HTMLElement, string[][]>()
  let hydratedChunkSets = new WeakMap<HTMLElement, Set<number>>()
  let groupRefs = new WeakMap<HTMLElement, string[]>()
  const groups = new Map<string, string[][]>()
  const failedGroups = new Set<string>()
  const pendingGroups = new Set<string>()
  let route = new AbortController()

  let queued = new WeakSet<HTMLElement>()
  let queuedForDehydrate = new WeakSet<HTMLElement>()
  let queuedImages = new WeakSet<HTMLImageElement>()
  let eligibleForHydrate = new WeakSet<HTMLElement>()
  let eligibleForImageLoad = new WeakSet<HTMLImageElement>()
  let outsideRecycleRange = new WeakSet<HTMLElement>()
  let visibleHydrateBlocks = new Set<HTMLElement>()
  let hydrateObserver: IntersectionObserver | undefined
  let recycleObserver: IntersectionObserver | undefined
  let imageObserver: IntersectionObserver | undefined
  let longTaskObserver: PerformanceObserver | undefined
  let imageDialog: HTMLElement | undefined
  let imageViewerPreviousFocus: HTMLElement | undefined
  let imageViewerScale = 1
  let imageViewerOffsetX = 0
  let imageViewerOffsetY = 0
  let suppressImageViewerClick = false
  let imageViewerDrag:
    | {
        pointerId: number
        startX: number
        startY: number
        originX: number
        originY: number
        moved: boolean
      }
    | undefined
  let idleHandle: IdleCallbackHandle | undefined
  let scrollStopTimer: number | undefined
  let resizeStopTimer: number | undefined
  let deferredWorkTimer: number | undefined
  let activeImage: HTMLImageElement | undefined
  let activeImageTimer: number | undefined
  let userIsScrolling = false
  let viewportIsChanging = false
  let isHugeCodePage = false
  let isExtremeCodePage = false
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
    const lines = (code ? (parseClipboardSource(code) ?? code.textContent ?? "") : "").split("\n")
    sourceCache.set(pre, lines)
    return lines
  }

  function ensureChunkBody(pre: HTMLElement, code: HTMLElement, chunkSize: number): HTMLElement {
    const existing = code.firstElementChild as HTMLElement | null
    if (existing) return existing
    const body = document.createElement("span")
    body.dataset.komeiChunkBody = ""
    const lines = getSourceLines(pre)
    for (let start = 0; start < lines.length; start += chunkSize) {
      const group = document.createElement("span")
      group.textContent = lines.slice(start, start + chunkSize).join("\n")
      body.append(group)
    }
    code.replaceChildren(body)
    return body
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

  function hydratedSet(pre: HTMLElement) {
    let set = hydratedChunkSets.get(pre)
    if (!set) {
      set = new Set<number>()
      hydratedChunkSets.set(pre, set)
    }
    return set
  }

  function hydratedChunkCount(pre: HTMLElement): number {
    return hydratedSet(pre).size
  }

  function syncHydrationState(pre: HTMLElement) {
    const count = hydratedChunkCount(pre)
    pre.dataset.komeiHydratedChunks = String(count)
    pre.dataset.komeiCodeHydrated =
      count >= chunkCount(pre) && chunkCount(pre) > 0 ? "true" : "false"
    if (pre.dataset.komeiOriginalTabindex !== undefined) {
      pre.tabIndex = count > 0 ? Number(pre.dataset.komeiOriginalTabindex) : -1
    }
  }

  function groupFor(pre: HTMLElement, index: number) {
    if (!pre.hasAttribute("data-komei-code-groups")) return undefined
    let refs = groupRefs.get(pre)
    if (!refs) {
      refs = pre.dataset.komeiCodeGroups!.split(" ")
      groupRefs.set(pre, refs)
    }
    return refs[Math.floor(index / Number(pre.dataset.komeiGroupSize))]
  }

  async function loadGroup(hash: string, expectedChunks: number) {
    if (pendingGroups.size >= 2 || pendingGroups.has(hash)) return
    const { signal } = route
    pendingGroups.add(hash)
    try {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid highlight reference")
      const response = await fetch(`/static/highlight/${hash}.json`, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const chunks = await response.json()
      if (signal.aborted) return
      if (
        !Array.isArray(chunks) ||
        chunks.length !== expectedChunks ||
        !chunks.every(
          (chunk) =>
            Array.isArray(chunk) &&
            chunk.length > 0 &&
            chunk.every((line) => typeof line === "string"),
        )
      )
        throw new Error("Invalid highlight group")
      if (groups.size >= 24) groups.delete(groups.keys().next().value!)
      groups.set(hash, chunks)
    } catch (error) {
      if (!signal.aborted) {
        failedGroups.add(hash)
        console.warn("Code highlighting unavailable", hash, error)
      }
    } finally {
      if (!signal.aborted) {
        pendingGroups.delete(hash)
        // Re-evaluate the *current* window, not the chunk that triggered the fetch.
        enqueueVisibleHydrateBlocks()
      }
    }
  }

  function visibleChunkWindow(pre: HTMLElement) {
    const totalChunks = chunkCount(pre)
    const rect = pre.getBoundingClientRect()
    const sourceLineCount = Math.max(1, Number(pre.dataset.codeLines))
    const chunkSize = Math.max(1, Number(pre.dataset.komeiCodeChunkSize ?? "12"))
    const blockHeight = Math.max(1, rect.height)
    const scanPadding = 520
    const visibleTop = Math.max(0, -rect.top - scanPadding)
    const visibleBottom = Math.min(blockHeight, window.innerHeight - rect.top + scanPadding)
    if (visibleBottom < 0 || visibleTop > blockHeight) return undefined

    const firstLine = Math.max(0, Math.floor((visibleTop / blockHeight) * sourceLineCount))
    const lastLine = Math.min(
      sourceLineCount - 1,
      Math.ceil((visibleBottom / blockHeight) * sourceLineCount),
    )
    const start = Math.max(0, Math.floor(firstLine / chunkSize) - 2)
    const end = Math.min(totalChunks - 1, Math.ceil(lastLine / chunkSize) + 2)
    const set = hydratedSet(pre)
    for (let index = start; index <= end; index++) {
      if (set.has(index)) continue
      const hash = groupFor(pre, index)
      if (hash !== "-" && !(hash && failedGroups.has(hash))) return index
    }
    return undefined
  }

  function hydrateChunk(pre: HTMLElement): boolean {
    const code = getCode(pre)
    if (!code) return false
    const index = visibleChunkWindow(pre)
    if (index === undefined) return false

    const hash = groupFor(pre, index)
    const size = Number(pre.dataset.komeiGroupSize)
    const chunk = hash ? groups.get(hash)?.[index % size] : highlightChunks(pre)[index]
    if (!chunk) {
      if (hash) void loadGroup(hash, Math.min(size, chunkCount(pre) - index + (index % size)))
      if (chunkCount(pre) === 0) syncHydrationState(pre)
      pre.removeAttribute("aria-hidden")
      return false
    }

    const chunkSize = Number(pre.dataset.komeiCodeChunkSize ?? "12")
    const body = ensureChunkBody(pre, code, chunkSize)
    const template = document.createElement("template")
    template.innerHTML = chunk.join("")
    body.children[index].replaceChildren(template.content)
    code.removeAttribute("aria-hidden")
    hydratedSet(pre).add(index)
    syncHydrationState(pre)
    pre.removeAttribute("aria-hidden")
    return visibleChunkWindow(pre) !== undefined
  }

  function dehydrateChunk(pre: HTMLElement): boolean {
    const code = getCode(pre)
    const set = hydratedSet(pre)
    if (!code || set.size <= 0) return false

    const index = Math.max(...set)
    const chunkSize = Number(pre.dataset.komeiCodeChunkSize ?? "12")
    const start = index * chunkSize
    const lineCount = Math.min(chunkSize, Math.max(0, getSourceLines(pre).length - start))
    const sourceLines = getSourceLines(pre).slice(start, start + lineCount)
    code.firstElementChild!.children[index].textContent = sourceLines.join("\n")
    set.delete(index)
    syncHydrationState(pre)
    return set.size > 0
  }

  function recycleCodeBlock(pre: HTMLElement) {
    if (isExtremeCodePage) {
      // Keep one readable text node: a jump or history restore can arrive before idle work.
      const code = getCode(pre)
      if (code && hydratedChunkCount(pre) > 0) {
        code.textContent = getSourceLines(pre).join("\n")
        hydratedSet(pre).clear()
        syncHydrationState(pre)
      }
      return false
    }

    return dehydrateChunk(pre)
  }

  function enqueue(pre: HTMLElement) {
    if (queued.has(pre) || hydratedChunkCount(pre) >= chunkCount(pre)) return
    queued.add(pre)
    hydrateQueue.push(pre)
    scheduleWork()
  }

  function enqueueVisibleHydrateBlocks() {
    for (const block of visibleHydrateBlocks) {
      if (block.isConnected) enqueue(block)
    }
  }

  function refreshVisibleHydrateBlocks() {
    if (isExtremeCodePage) return
    const margin = isHugeCodePage ? 560 : 900
    for (const block of document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")) {
      const rect = block.getBoundingClientRect()
      if (rect.bottom >= -margin && rect.top <= window.innerHeight + margin) {
        eligibleForHydrate.add(block)
        visibleHydrateBlocks.add(block)
      }
    }
  }

  function enqueueDehydrate(pre: HTMLElement) {
    if (queuedForDehydrate.has(pre)) return
    if (hydratedChunkCount(pre) <= 0) return
    queuedForDehydrate.add(pre)
    dehydrateQueue.push(pre)
    scheduleWork()
  }

  function imagePlaceholderHeight(img: HTMLImageElement) {
    const rectHeight = img.getBoundingClientRect().height
    if (rectHeight > 24) return rectHeight
    const height = Number(img.getAttribute("height"))
    return Number.isFinite(height) && height > 24 ? height : 160
  }

  function imageFrame(img: HTMLImageElement) {
    const parent = img.parentElement
    if (parent?.classList.contains("komei-image-frame")) return parent

    const frame = document.createElement("span")
    frame.className = "komei-image-frame komei-image-frame--loading"
    img.before(frame)
    frame.append(img)
    return frame
  }

  function isInteractiveImage(img: HTMLImageElement) {
    return Boolean(img.closest("a, button, [role='button'], summary"))
  }

  function imageIsReady(img: HTMLImageElement) {
    return img.complete && img.naturalWidth > 0
  }

  function disableImageDetail(img: HTMLImageElement) {
    img.classList.remove("komei-image-detail-target")
    img.removeAttribute("tabindex")
    if (img.dataset.komeiImageDetailLabel === "true") {
      img.removeAttribute("aria-label")
      delete img.dataset.komeiImageDetailLabel
    }
    img.removeAttribute("aria-haspopup")
  }

  function enableImageDetail(img: HTMLImageElement) {
    if (
      isInteractiveImage(img) ||
      !imageIsReady(img) ||
      img.classList.contains("komei-image-loading") ||
      img.classList.contains("komei-image-error")
    ) {
      disableImageDetail(img)
      return false
    }

    img.classList.add("komei-image-detail-target")
    img.tabIndex = 0
    img.setAttribute("aria-haspopup", "dialog")
    if (!img.hasAttribute("aria-label")) {
      img.setAttribute("aria-label", "打开图片详情")
      img.dataset.komeiImageDetailLabel = "true"
    }
    return true
  }

  function setImageState(img: HTMLImageElement, state: "loading" | "loaded" | "error") {
    const frame = imageFrame(img)
    frame.classList.toggle("komei-image-frame--loading", state === "loading")
    frame.classList.toggle("komei-image-frame--loaded", state === "loaded")
    frame.classList.toggle("komei-image-frame--error", state === "error")
    img.classList.toggle("komei-image-loading", state === "loading")
    img.classList.toggle("komei-image-loaded", state === "loaded")
    img.classList.toggle("komei-image-error", state === "error")
    if (state === "loaded") {
      enableImageDetail(img)
    } else {
      disableImageDetail(img)
    }
  }

  function detailSource(img: HTMLImageElement) {
    if (!img.classList.contains("komei-image-detail-target") || isInteractiveImage(img))
      return undefined
    if (!imageIsReady(img)) return undefined
    if (
      img.classList.contains("komei-image-loading") ||
      img.classList.contains("komei-image-error")
    ) {
      return undefined
    }
    return img.currentSrc || img.getAttribute("src") || undefined
  }

  function clampImageScale(scale: number) {
    return Math.min(5, Math.max(1, scale))
  }

  function syncImageViewerTransform() {
    const dialog = imageDialog
    if (!dialog) return
    dialog.style.setProperty("--komei-image-viewer-scale", String(imageViewerScale))
    dialog.style.setProperty("--komei-image-viewer-x", `${imageViewerOffsetX}px`)
    dialog.style.setProperty("--komei-image-viewer-y", `${imageViewerOffsetY}px`)
    dialog.classList.toggle("komei-image-viewer--zoomed", imageViewerScale > 1.02)
  }

  function resetImageViewerTransform() {
    imageViewerScale = 1
    imageViewerOffsetX = 0
    imageViewerOffsetY = 0
    imageViewerDrag = undefined
    suppressImageViewerClick = false
    syncImageViewerTransform()
  }

  function setImageViewerScale(scale: number) {
    imageViewerScale = clampImageScale(scale)
    if (imageViewerScale <= 1.02) {
      imageViewerScale = 1
      imageViewerOffsetX = 0
      imageViewerOffsetY = 0
    }
    syncImageViewerTransform()
  }

  function ensureImageDialog() {
    if (imageDialog?.isConnected) return imageDialog

    const dialog = document.createElement("div")
    dialog.className = "komei-image-viewer"
    dialog.hidden = true
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("aria-modal", "true")
    dialog.setAttribute("aria-label", "图片预览")
    dialog.tabIndex = -1
    dialog.innerHTML = `
      <img class="komei-image-viewer__image" alt="" />
    `

    dialog.addEventListener("click", (event) => {
      if (suppressImageViewerClick) {
        suppressImageViewerClick = false
        return
      }
      if (event.target === dialog) closeImageDialog()
    })
    dialog.addEventListener("keydown", (event) => {
      const blockedKeys = new Set([
        " ",
        "Spacebar",
        "PageDown",
        "PageUp",
        "Home",
        "End",
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
      ])
      if (event.key === "Escape") {
        event.preventDefault()
        closeImageDialog()
        return
      }
      if (blockedKeys.has(event.key)) event.preventDefault()
    })
    dialog.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()
        const delta = event.deltaY < 0 ? 0.18 : -0.18
        setImageViewerScale(imageViewerScale + delta)
      },
      { passive: false },
    )

    const viewerImage = dialog.querySelector<HTMLImageElement>(".komei-image-viewer__image")
    viewerImage?.addEventListener("click", (event) => {
      event.stopPropagation()
      if (suppressImageViewerClick) {
        suppressImageViewerClick = false
        return
      }
      setImageViewerScale(imageViewerScale > 1.02 ? 1 : 2)
    })
    if (viewerImage) viewerImage.draggable = false
    viewerImage?.addEventListener("pointerdown", (event) => {
      if (imageViewerScale <= 1.02) return
      event.preventDefault()
      viewerImage.setPointerCapture(event.pointerId)
      imageViewerDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: imageViewerOffsetX,
        originY: imageViewerOffsetY,
        moved: false,
      }
    })
    viewerImage?.addEventListener("pointermove", (event) => {
      if (!imageViewerDrag || imageViewerDrag.pointerId !== event.pointerId) return
      event.preventDefault()
      const movedX = event.clientX - imageViewerDrag.startX
      const movedY = event.clientY - imageViewerDrag.startY
      if (Math.hypot(movedX, movedY) > 4) imageViewerDrag.moved = true
      imageViewerOffsetX = imageViewerDrag.originX + event.clientX - imageViewerDrag.startX
      imageViewerOffsetY = imageViewerDrag.originY + event.clientY - imageViewerDrag.startY
      syncImageViewerTransform()
    })
    const stopImageDrag = (event: PointerEvent) => {
      if (imageViewerDrag?.pointerId !== event.pointerId) return
      if (imageViewerDrag.moved) suppressImageViewerClick = true
      imageViewerDrag = undefined
      if (viewerImage?.hasPointerCapture(event.pointerId))
        viewerImage.releasePointerCapture(event.pointerId)
    }
    viewerImage?.addEventListener("pointerup", stopImageDrag)
    viewerImage?.addEventListener("pointercancel", stopImageDrag)

    document.body.append(dialog)
    imageDialog = dialog
    return dialog
  }

  function closeImageDialog() {
    const dialog = imageDialog
    if (!dialog || dialog.hidden) return
    const image = dialog.querySelector<HTMLImageElement>(".komei-image-viewer__image")
    image?.removeAttribute("src")
    dialog.hidden = true
    dialog.classList.remove("komei-image-viewer--open")
    resetImageViewerTransform()
    imageViewerPreviousFocus?.focus({ preventScroll: true })
    imageViewerPreviousFocus = undefined
  }

  function openImageDialog(img: HTMLImageElement) {
    const src = detailSource(img)
    if (!src) return

    const dialog = ensureImageDialog()
    const viewerImage = dialog.querySelector<HTMLImageElement>(".komei-image-viewer__image")
    if (!viewerImage) return

    const label = img.alt || img.title || "图片预览"
    const previousScrollY = window.scrollY
    imageViewerPreviousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    resetImageViewerTransform()
    viewerImage.src = src
    viewerImage.alt = label
    dialog.hidden = false
    dialog.classList.add("komei-image-viewer--open")
    dialog.focus({ preventScroll: true })
    if (window.scrollY !== previousScrollY)
      window.scrollTo({ top: previousScrollY, behavior: "instant" })
  }

  function setupImageDetailTargets() {
    for (const img of document.querySelectorAll<HTMLImageElement>("article img[src]")) {
      if (
        isInteractiveImage(img) ||
        img.classList.contains("komei-image-loading") ||
        img.classList.contains("komei-image-error")
      ) {
        disableImageDetail(img)
        continue
      }

      if (enableImageDetail(img) || img.dataset.komeiDetailPending === "true") continue
      img.dataset.komeiDetailPending = "true"
      img.addEventListener(
        "load",
        () => {
          delete img.dataset.komeiDetailPending
          enableImageDetail(img)
        },
        { once: true },
      )
      img.addEventListener(
        "error",
        () => {
          delete img.dataset.komeiDetailPending
          disableImageDetail(img)
        },
        { once: true },
      )
    }
  }

  function deferImage(img: HTMLImageElement) {
    if (img.dataset.komeiDeferredSrc || img.dataset.komeiImageLoaded === "true") return
    const src = img.getAttribute("src")
    const srcset = img.getAttribute("srcset")
    if (!src && !srcset) return

    if (src) img.dataset.komeiDeferredSrc = src
    if (srcset) img.dataset.komeiDeferredSrcset = srcset
    const sizes = img.getAttribute("sizes")
    if (sizes) img.dataset.komeiDeferredSizes = sizes
    const placeholderHeight = `${imagePlaceholderHeight(img)}px`
    img.style.setProperty("--komei-image-placeholder-height", placeholderHeight)
    imageFrame(img).style.setProperty("--komei-image-placeholder-height", placeholderHeight)
    img.loading = "lazy"
    img.decoding = "async"
    img.removeAttribute("src")
    img.removeAttribute("srcset")
    img.removeAttribute("sizes")
    img.classList.add("komei-deferred-image")
    setImageState(img, "loading")
  }

  function enqueueImage(img: HTMLImageElement) {
    if (queuedImages.has(img) || img.dataset.komeiImageLoaded === "true") return
    if (!img.dataset.komeiDeferredSrc && !img.dataset.komeiDeferredSrcset) return
    queuedImages.add(img)
    imageQueue.push(img)
    scheduleWork()
  }

  function releaseActiveImage(img: HTMLImageElement) {
    if (activeImage !== img) return
    window.clearTimeout(activeImageTimer)
    activeImageTimer = undefined
    activeImage = undefined
    scheduleDeferredWork(420)
  }

  function completeImage(img: HTMLImageElement, state: "loaded" | "error") {
    releaseActiveImage(img)
    img.dataset.komeiImageLoaded = state === "loaded" ? "true" : "false"
    img.classList.remove("komei-deferred-image")
    setImageState(img, state)
    imageObserver?.unobserve(img)
    img.parentElement?.classList.remove("komei-image-frame--near")
    if (state === "loaded") {
      img.style.removeProperty("--komei-image-placeholder-height")
      img.parentElement?.style.removeProperty("--komei-image-placeholder-height")
      setupImageDetailTargets()
    }
    delete img.dataset.komeiDeferredSrc
    delete img.dataset.komeiDeferredSrcset
    delete img.dataset.komeiDeferredSizes
  }

  function restoreDeferredImage(img: HTMLImageElement) {
    if (activeImage || img.dataset.komeiImageLoaded === "true") return false
    const src = img.dataset.komeiDeferredSrc
    const srcset = img.dataset.komeiDeferredSrcset
    if (!src && !srcset) return false

    activeImage = img
    setImageState(img, "loading")
    img.addEventListener("load", () => completeImage(img, "loaded"), { once: true })
    img.addEventListener("error", () => completeImage(img, "error"), { once: true })
    activeImageTimer = window.setTimeout(() => releaseActiveImage(img), 8000)

    const sizes = img.dataset.komeiDeferredSizes
    if (sizes) img.setAttribute("sizes", sizes)
    if (srcset) img.setAttribute("srcset", srcset)
    if (src) img.setAttribute("src", src)
    return true
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
    if (isHugeCodePage && performance.now() - lastScrollAt < 900) return true
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
        if (recycleCodeBlock(dehydrateCandidate) && outsideRecycleRange.has(dehydrateCandidate)) {
          enqueueDehydrate(dehydrateCandidate)
        }
      }
      if (
        hydrateQueue.length > 0 ||
        dehydrateQueue.length > 0 ||
        (!activeImage && imageQueue.length > 0)
      ) {
        scheduleWork()
      }
      return
    }

    const imageCandidate = activeImage ? undefined : imageQueue.shift()
    if (imageCandidate) {
      queuedImages.delete(imageCandidate)
      if (imageCandidate.isConnected && eligibleForImageLoad.has(imageCandidate)) {
        restoreDeferredImage(imageCandidate)
      }
      if (
        hydrateQueue.length > 0 ||
        dehydrateQueue.length > 0 ||
        (!activeImage && imageQueue.length > 0)
      ) {
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

    if (
      hydrateQueue.length > 0 ||
      dehydrateQueue.length > 0 ||
      (!activeImage && imageQueue.length > 0)
    )
      scheduleWork()
  }

  function onScroll() {
    userIsScrolling = true
    lastScrollAt = performance.now()
    lastKnownScrollY = window.scrollY
    window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(
      () => {
        userIsScrolling = false
        if (!isExtremeCodePage) refreshVisibleHydrateBlocks()
        enqueueVisibleHydrateBlocks()
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
    route.abort()
    route = new AbortController()
    pendingGroups.clear()
    failedGroups.clear()
    groups.clear()
    groupRefs = new WeakMap()
    sourceCache = new WeakMap()
    chunkCache = new WeakMap()
    hydratedChunkSets = new WeakMap()
    hydrateObserver?.disconnect()
    recycleObserver?.disconnect()
    imageObserver?.disconnect()
    longTaskObserver?.disconnect()
    if (idleHandle !== undefined) {
      cancelIdle(idleHandle)
      idleHandle = undefined
    }
    window.clearTimeout(deferredWorkTimer)
    deferredWorkTimer = undefined
    hydrateQueue.length = 0
    dehydrateQueue.length = 0
    imageQueue.length = 0
    queued = new WeakSet<HTMLElement>()
    queuedForDehydrate = new WeakSet<HTMLElement>()
    queuedImages = new WeakSet<HTMLImageElement>()
    eligibleForHydrate = new WeakSet<HTMLElement>()
    eligibleForImageLoad = new WeakSet<HTMLImageElement>()
    outsideRecycleRange = new WeakSet<HTMLElement>()
    visibleHydrateBlocks = new Set<HTMLElement>()
    activeImage = undefined
    window.clearTimeout(activeImageTimer)
    activeImageTimer = undefined
    backoffUntil = 0
    closeImageDialog()

    setupImageDetailTargets()
    const onImageOpen = (event: Event) => {
      const target = event.target as Element | null
      if (!(target instanceof Element)) return
      const img = target?.closest<HTMLImageElement>("article img.komei-image-detail-target")
      if (!img) return
      if (
        event instanceof MouseEvent &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      ) {
        return
      }
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      openImageDialog(img)
    }

    document.addEventListener("click", onImageOpen)
    document.addEventListener("keydown", onImageOpen)

    const blocks = [...document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")]
    isHugeCodePage = false
    isExtremeCodePage = false
    document.body.classList.remove("komei-large-code-page", "komei-extreme-code-page")
    if (blocks.length === 0) {
      window.addCleanup(() => {
        document.removeEventListener("click", onImageOpen)
        document.removeEventListener("keydown", onImageOpen)
      })
      return
    }
    isHugeCodePage = blocks.length >= 160 || document.body.scrollHeight > 120_000
    isExtremeCodePage = blocks.length >= 260
    lastScrollAt = isHugeCodePage ? performance.now() : 0
    lastKnownScrollY = window.scrollY
    document.body.classList.toggle("komei-large-code-page", isHugeCodePage)
    document.body.classList.toggle("komei-extreme-code-page", isExtremeCodePage)
    if (isHugeCodePage) setupLongTaskObserver()

    hydrateObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pre = entry.target as HTMLElement
          if (entry.isIntersecting) {
            eligibleForHydrate.add(pre)
            visibleHydrateBlocks.add(pre)
            enqueue(pre)
          } else {
            eligibleForHydrate.delete(pre)
            visibleHydrateBlocks.delete(pre)
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

    if (isHugeCodePage) {
      imageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const img = entry.target as HTMLImageElement
            const frame = img.parentElement
            if (entry.isIntersecting) {
              frame?.classList.add("komei-image-frame--near")
              eligibleForImageLoad.add(img)
              enqueueImage(img)
            } else {
              frame?.classList.remove("komei-image-frame--near")
              eligibleForImageLoad.delete(img)
            }
          }
        },
        { rootMargin: "420px 0px" },
      )
    }

    for (const block of blocks) {
      block.dataset.komeiHydratedChunks = "0"
      hydrateObserver.observe(block)
      recycleObserver.observe(block)
    }

    if (imageObserver) {
      for (const img of document.querySelectorAll<HTMLImageElement>(
        ".popover-hint img[src], article img[src]",
      )) {
        const top = img.getBoundingClientRect().top
        if (top > window.innerHeight + 420) deferImage(img)
        if (img.classList.contains("komei-deferred-image")) imageObserver.observe(img)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    window.addCleanup(() => {
      route.abort()
      hydrateObserver?.disconnect()
      recycleObserver?.disconnect()
      imageObserver?.disconnect()
      longTaskObserver?.disconnect()
      closeImageDialog()
      hydrateObserver = undefined
      recycleObserver = undefined
      imageObserver = undefined
      longTaskObserver = undefined
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      document.removeEventListener("click", onImageOpen)
      document.removeEventListener("keydown", onImageOpen)
      window.clearTimeout(scrollStopTimer)
      window.clearTimeout(resizeStopTimer)
      window.clearTimeout(deferredWorkTimer)
      window.clearTimeout(activeImageTimer)
      deferredWorkTimer = undefined
      activeImageTimer = undefined
      activeImage = undefined
      if (idleHandle !== undefined) {
        cancelIdle(idleHandle)
        idleHandle = undefined
      }
      hydrateQueue.length = 0
      dehydrateQueue.length = 0
      imageQueue.length = 0
      queued = new WeakSet<HTMLElement>()
      queuedForDehydrate = new WeakSet<HTMLElement>()
      queuedImages = new WeakSet<HTMLImageElement>()
      eligibleForHydrate = new WeakSet<HTMLElement>()
      eligibleForImageLoad = new WeakSet<HTMLImageElement>()
      outsideRecycleRange = new WeakSet<HTMLElement>()
      visibleHydrateBlocks = new Set<HTMLElement>()
    })
  })
}
