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
  const hydratedBlocks = new Set<HTMLElement>()
  const sourceCache = new WeakMap<HTMLElement, string>()
  let queued = new WeakSet<HTMLElement>()
  let queuedForDehydrate = new WeakSet<HTMLElement>()
  let queuedImages = new WeakSet<HTMLImageElement>()
  let eligibleForHydrate = new WeakSet<HTMLElement>()
  let eligibleForImageLoad = new WeakSet<HTMLImageElement>()
  let outsideRecycleRange = new WeakSet<HTMLElement>()
  let hydrateObserver: IntersectionObserver | undefined
  let recycleObserver: IntersectionObserver | undefined
  let imageObserver: IntersectionObserver | undefined
  let idleHandle: IdleCallbackHandle | undefined
  let scrollStopTimer: number | undefined
  let resizeStopTimer: number | undefined
  let deferredWorkTimer: number | undefined
  let userIsScrolling = false
  let viewportIsChanging = false
  let isHugeCodePage = false
  let lastScrollAt = 0
  let lastKnownScrollY = 0

  const idle =
    window.requestIdleCallback ??
    ((cb: IdleCallback) =>
      window.setTimeout(() => cb({ timeRemaining: () => 18, didTimeout: true }), 120))
  const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout

  function getCode(pre: HTMLElement): HTMLElement | null {
    return pre.querySelector(":scope > code")
  }

  function copyCodeAttributes(from: HTMLElement, to: HTMLElement) {
    for (const attr of from.attributes) {
      if (attr.name === "style") continue
      to.setAttribute(attr.name, attr.value)
    }
  }

  function rememberSource(pre: HTMLElement) {
    if (sourceCache.has(pre)) return
    sourceCache.set(pre, getCode(pre)?.textContent ?? "")
  }

  function hydrate(pre: HTMLElement) {
    const html = pre.dataset.komeiHighlightHtml
    if (!html || pre.dataset.komeiCodeHydrated === "true") return

    const currentCode = getCode(pre)
    if (!currentCode) return
    rememberSource(pre)

    const template = document.createElement("template")
    template.innerHTML = html
    const highlightedCode = template.content.firstElementChild
    if (!(highlightedCode instanceof HTMLElement)) return

    currentCode.replaceWith(highlightedCode)
    pre.dataset.komeiCodeHydrated = "true"
    pre.removeAttribute("aria-hidden")
    if (pre.dataset.komeiOriginalTabindex !== undefined) {
      pre.tabIndex = Number(pre.dataset.komeiOriginalTabindex)
    }
    hydratedBlocks.add(pre)
  }

  function dehydrate(pre: HTMLElement) {
    if (pre.dataset.komeiCodeHydrated !== "true") return
    const currentCode = getCode(pre)
    if (!currentCode) return

    const placeholder = document.createElement("code")
    copyCodeAttributes(currentCode, placeholder)
    placeholder.removeAttribute("style")
    placeholder.removeAttribute("data-theme")
    placeholder.dataset.komeiCodePlaceholder = "true"
    placeholder.setAttribute("aria-hidden", "true")
    placeholder.textContent = sourceCache.get(pre) ?? currentCode.textContent ?? ""
    currentCode.replaceWith(placeholder)
    pre.dataset.komeiCodeHydrated = "false"
    if (pre.dataset.komeiOriginalTabindex !== undefined) {
      pre.tabIndex = -1
    }
    hydratedBlocks.delete(pre)
  }

  function enqueue(pre: HTMLElement) {
    if (pre.dataset.komeiCodeHydrated === "true" || queued.has(pre)) return
    queued.add(pre)
    hydrateQueue.push(pre)
    scheduleWork()
  }

  function enqueueDehydrate(pre: HTMLElement) {
    if (pre.dataset.komeiCodeHydrated !== "true" || queuedForDehydrate.has(pre)) return
    queuedForDehydrate.add(pre)
    dehydrateQueue.push(pre)
    scheduleWork()
  }

  function deferImage(img: HTMLImageElement) {
    const src = img.getAttribute("src")
    if (!src || img.dataset.komeiDeferredSrc) return
    img.dataset.komeiDeferredSrc = src
    img.removeAttribute("src")
    img.classList.add("komei-deferred-image")
  }

  function enqueueImage(img: HTMLImageElement) {
    if (!img.dataset.komeiDeferredSrc || queuedImages.has(img)) return
    queuedImages.add(img)
    imageQueue.push(img)
    scheduleWork()
  }

  function loadDeferredImage(img: HTMLImageElement) {
    const src = img.dataset.komeiDeferredSrc
    if (!src || img.getAttribute("src")) return
    img.setAttribute("src", src)
    delete img.dataset.komeiDeferredSrc
    img.classList.remove("komei-deferred-image")
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

  function processQueue(deadline: IdleDeadlineLike) {
    idleHandle = undefined

    if (userIsScrolling || viewportIsChanging) {
      return
    }

    if (isHugeCodePage && window.scrollY !== lastKnownScrollY) {
      lastKnownScrollY = window.scrollY
      lastScrollAt = performance.now()
      scheduleDeferredWork(420)
      return
    }

    if (isHugeCodePage && performance.now() - lastScrollAt < 2200) {
      scheduleDeferredWork(360)
      return
    }

    const minimumBudget = isHugeCodePage ? 14 : 8
    if (!deadline.didTimeout && deadline.timeRemaining() < minimumBudget) {
      scheduleWork()
      return
    }

    const imageCandidate = imageQueue.shift()
    if (imageCandidate) {
      queuedImages.delete(imageCandidate)
      if (imageCandidate.isConnected && eligibleForImageLoad.has(imageCandidate)) {
        loadDeferredImage(imageCandidate)
      }
      if (hydrateQueue.length > 0 || dehydrateQueue.length > 0 || imageQueue.length > 0) {
        scheduleWork()
      }
      return
    }

    const dehydrateCandidate = dehydrateQueue.shift()
    if (dehydrateCandidate) {
      queuedForDehydrate.delete(dehydrateCandidate)
      if (dehydrateCandidate.isConnected && outsideRecycleRange.has(dehydrateCandidate)) {
        dehydrate(dehydrateCandidate)
      }
      if (hydrateQueue.length > 0 || dehydrateQueue.length > 0) scheduleWork()
      return
    }

    while (
      hydrateQueue.length > 0 &&
      (deadline.timeRemaining() > minimumBudget || deadline.didTimeout)
    ) {
      const pre = hydrateQueue.shift()
      if (!pre || !pre.isConnected) continue
      queued.delete(pre)
      if (!eligibleForHydrate.has(pre)) continue
      hydrate(pre)
      break
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
    hydrateQueue.length = 0
    queued = new WeakSet<HTMLElement>()
    window.clearTimeout(resizeStopTimer)
    resizeStopTimer = window.setTimeout(
      () => {
        viewportIsChanging = false
        scheduleWork()
      },
      isHugeCodePage ? 760 : 420,
    )
  }

  document.addEventListener("nav", () => {
    hydrateObserver?.disconnect()
    recycleObserver?.disconnect()
    imageObserver?.disconnect()
    if (idleHandle !== undefined) {
      cancelIdle(idleHandle)
      idleHandle = undefined
    }
    hydrateQueue.length = 0
    dehydrateQueue.length = 0
    imageQueue.length = 0
    hydratedBlocks.clear()
    queued = new WeakSet<HTMLElement>()
    queuedForDehydrate = new WeakSet<HTMLElement>()
    queuedImages = new WeakSet<HTMLImageElement>()
    eligibleForHydrate = new WeakSet<HTMLElement>()
    eligibleForImageLoad = new WeakSet<HTMLImageElement>()
    outsideRecycleRange = new WeakSet<HTMLElement>()

    const blocks = [...document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")]
    isHugeCodePage = false
    document.body.classList.remove("komei-large-code-page")
    if (blocks.length === 0) return
    isHugeCodePage = blocks.length >= 160 || document.body.scrollHeight > 120_000
    lastScrollAt = isHugeCodePage ? performance.now() : 0
    lastKnownScrollY = window.scrollY
    document.body.classList.toggle("komei-large-code-page", isHugeCodePage)

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

    if (isHugeCodePage) {
      imageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const img = entry.target as HTMLImageElement
            if (entry.isIntersecting) {
              eligibleForImageLoad.add(img)
              enqueueImage(img)
            } else {
              eligibleForImageLoad.delete(img)
            }
          }
        },
        { rootMargin: "320px 0px" },
      )
    }

    for (const block of blocks) {
      hydrateObserver.observe(block)
      recycleObserver.observe(block)
    }

    if (imageObserver) {
      for (const img of document.querySelectorAll<HTMLImageElement>(".popover-hint img[src]")) {
        deferImage(img)
        imageObserver.observe(img)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    window.addCleanup(() => {
      hydrateObserver?.disconnect()
      recycleObserver?.disconnect()
      imageObserver?.disconnect()
      hydrateObserver = undefined
      recycleObserver = undefined
      imageObserver = undefined
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
      imageQueue.length = 0
      hydratedBlocks.clear()
      queued = new WeakSet<HTMLElement>()
      queuedForDehydrate = new WeakSet<HTMLElement>()
      queuedImages = new WeakSet<HTMLImageElement>()
      eligibleForHydrate = new WeakSet<HTMLElement>()
      eligibleForImageLoad = new WeakSet<HTMLImageElement>()
      outsideRecycleRange = new WeakSet<HTMLElement>()
    })
  })
}
