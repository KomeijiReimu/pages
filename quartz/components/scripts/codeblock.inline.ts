{
  type IdleDeadlineLike = {
    timeRemaining: () => number
    didTimeout?: boolean
  }

  type IdleCallbackHandle = number

  type IdleCallback = (deadline: IdleDeadlineLike) => void

  const hydrateQueue: HTMLElement[] = []
  const hydratedBlocks = new Set<HTMLElement>()
  const sourceCache = new WeakMap<HTMLElement, string>()
  let queued = new WeakSet<HTMLElement>()
  let observer: IntersectionObserver | undefined
  let idleHandle: IdleCallbackHandle | undefined
  let scrollStopTimer: number | undefined
  let resizeStopTimer: number | undefined
  let userIsScrolling = false
  let viewportIsChanging = false

  const idle =
    window.requestIdleCallback ??
    ((cb: IdleCallback) =>
      window.setTimeout(() => cb({ timeRemaining: () => 10, didTimeout: true }), 80))
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

  function scheduleWork() {
    if (idleHandle !== undefined) return
    idleHandle = idle(processQueue)
  }

  function shouldHydrate(pre: HTMLElement) {
    return distanceFromViewport(pre) < window.innerHeight * 1.6
  }

  function recycleHydratedBlocks() {
    for (const pre of [...hydratedBlocks]) {
      if (!pre.isConnected || distanceFromViewport(pre) > window.innerHeight * 3) {
        dehydrate(pre)
      }
    }
  }

  function processQueue(deadline: IdleDeadlineLike) {
    idleHandle = undefined

    if (userIsScrolling || viewportIsChanging) {
      return
    }

    recycleHydratedBlocks()

    while (hydrateQueue.length > 0 && (deadline.timeRemaining() > 8 || deadline.didTimeout)) {
      const pre = hydrateQueue.shift()
      if (!pre || !pre.isConnected) continue
      queued.delete(pre)
      if (!shouldHydrate(pre)) continue
      hydrate(pre)
      break
    }

    if (hydrateQueue.length > 0) scheduleWork()
  }

  function distanceFromViewport(element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom < 0) return Math.abs(rect.bottom)
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight
    return 0
  }

  function onScroll() {
    userIsScrolling = true
    window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(() => {
      userIsScrolling = false
      recycleHydratedBlocks()
      scheduleWork()
    }, 360)
  }

  function onResize() {
    viewportIsChanging = true
    hydrateQueue.length = 0
    queued = new WeakSet<HTMLElement>()
    window.clearTimeout(resizeStopTimer)
    resizeStopTimer = window.setTimeout(() => {
      viewportIsChanging = false
      recycleHydratedBlocks()
      scheduleWork()
    }, 420)
  }

  document.addEventListener("nav", () => {
    observer?.disconnect()
    if (idleHandle !== undefined) {
      cancelIdle(idleHandle)
      idleHandle = undefined
    }
    hydrateQueue.length = 0
    hydratedBlocks.clear()
    queued = new WeakSet<HTMLElement>()

    const blocks = [...document.querySelectorAll<HTMLElement>("pre[data-komei-code-lazy]")]
    if (blocks.length === 0) return

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pre = entry.target as HTMLElement
          if (entry.isIntersecting) {
            enqueue(pre)
          }
        }
      },
      { rootMargin: "600px 0px" },
    )

    for (const block of blocks) {
      rememberSource(block)
      observer.observe(block)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    window.addCleanup(() => {
      observer?.disconnect()
      observer = undefined
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      window.clearTimeout(scrollStopTimer)
      window.clearTimeout(resizeStopTimer)
      if (idleHandle !== undefined) {
        cancelIdle(idleHandle)
        idleHandle = undefined
      }
      hydrateQueue.length = 0
      hydratedBlocks.clear()
      queued = new WeakSet<HTMLElement>()
    })
  })
}
