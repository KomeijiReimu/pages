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
  const sourceCache = new WeakMap<HTMLElement, string[]>()
  const chunkCache = new WeakMap<HTMLElement, string[][]>()
  const hydratedChunkSets = new WeakMap<HTMLElement, Set<number>>()

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

  function lineElements(code: HTMLElement): HTMLCollection {
    return code.children
  }

  function ensurePlainLineElements(pre: HTMLElement, code: HTMLElement) {
    if (code.children.length > 0) return
    const lines = getSourceLines(pre)
    code.textContent = ""
    code.append(makePlainFragment(lines))
  }

  function virtualizeCodeBlock(pre: HTMLElement) {
    if (!isExtremeCodePage || pre.dataset.komeiCodeVirtualized === "true") return
    const code = getCode(pre)
    if (!code) return

    // GO README 这类极端页面不是 C++ 页面的简单加长版：代码块数量更多。
    // 远离视口时只保留稳定占位高度，源码和高亮在进入视口附近再恢复，
    // 避免大量源码文本常驻参与滚动绘制和命中测试。
    getSourceLines(pre)
    code.textContent = ""
    pre.dataset.komeiCodeVirtualized = "true"
    eligibleForHydrate.delete(pre)
    visibleHydrateBlocks.delete(pre)
    queued.delete(pre)
    queuedForDehydrate.delete(pre)
    resetHydratedSet(pre)
  }

  function restoreVirtualizedCodeBlock(pre: HTMLElement) {
    if (pre.dataset.komeiCodeVirtualized !== "true") return
    const code = getCode(pre)
    if (!code) return

    delete pre.dataset.komeiCodeVirtualized
    code.textContent = ""
    code.append(makePlainFragment(getSourceLines(pre)))
  }

  function replaceLineRange(
    code: HTMLElement,
    start: number,
    removeCount: number,
    fragment: DocumentFragment,
  ) {
    const lines = lineElements(code)
    const first = lines.item(start)
    if (!first) {
      code.append(fragment)
      return
    }

    const range = document.createRange()
    range.setStartBefore(first)
    const last = lines.item(Math.min(start + removeCount - 1, lines.length - 1))
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

  function hydratedSet(pre: HTMLElement) {
    let set = hydratedChunkSets.get(pre)
    if (!set) {
      set = new Set<number>()
      hydratedChunkSets.set(pre, set)
    }
    return set
  }

  function resetHydratedSet(pre: HTMLElement) {
    hydratedChunkSets.set(pre, new Set())
    syncHydrationState(pre)
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

  function firstUnhydratedChunk(pre: HTMLElement) {
    const set = hydratedSet(pre)
    for (let index = 0; index < chunkCount(pre); index++) {
      if (!set.has(index)) return index
    }
    return undefined
  }

  function visibleChunkWindow(pre: HTMLElement) {
    const totalChunks = chunkCount(pre)
    if (!isHugeCodePage || totalChunks <= 0) return firstUnhydratedChunk(pre)

    const rect = pre.getBoundingClientRect()
    const sourceLineCount = Math.max(1, getSourceLines(pre).length)
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
      if (!set.has(index)) return index
    }
    return undefined
  }

  function hydrateChunk(pre: HTMLElement): boolean {
    const code = getCode(pre)
    if (!code) return false
    const index = visibleChunkWindow(pre)
    if (index === undefined) return false

    restoreVirtualizedCodeBlock(pre)
    ensurePlainLineElements(pre, code)
    const chunk = highlightChunks(pre)[index]
    if (!chunk) {
      if (chunkCount(pre) === 0) syncHydrationState(pre)
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
    replaceLineRange(code, start, lineCount, makePlainFragment(sourceLines))
    set.delete(index)
    syncHydrationState(pre)
    return set.size > 0
  }

  function recycleCodeBlock(pre: HTMLElement) {
    if (isExtremeCodePage) {
      virtualizeCodeBlock(pre)
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
    const margin = isHugeCodePage ? 560 : 900
    for (const block of document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")) {
      const rect = block.getBoundingClientRect()
      if (rect.bottom >= -margin && rect.top <= window.innerHeight + margin) {
        restoreVirtualizedCodeBlock(block)
        eligibleForHydrate.add(block)
        visibleHydrateBlocks.add(block)
      } else if (isExtremeCodePage) {
        virtualizeCodeBlock(block)
      }
    }
  }

  function enqueueDehydrate(pre: HTMLElement) {
    if (queuedForDehydrate.has(pre) || hydratedChunkCount(pre) <= 0) return
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
        refreshVisibleHydrateBlocks()
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
            restoreVirtualizedCodeBlock(pre)
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

    if (isExtremeCodePage) refreshVisibleHydrateBlocks()

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
