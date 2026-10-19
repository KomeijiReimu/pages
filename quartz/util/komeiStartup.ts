// Only presentation routes participate. Reading routes always remain visible.
export const homeEntrySelectors = [
  ".komei-home-hero__backdrop",
  ".komei-home-hero__eyebrow",
  ".komei-home-hero h1",
  ".komei-home-hero__actions > *",
  ".komei-profile-card",
]
// These are independent cards, never both a gallery shell and its descendants.
export const homeRevealSelectors = [
  ".komei-section-heading",
  ".komei-post-card",
  ".komei-category-card",
  ".komei-tag-cloud",
  ".komei-module-card",
  ".komei-home-gallery__seasons-head",
  ".komei-home-gallery-season",
  ".komei-home-gallery__postcard-card",
  ".komei-home-gallery-masonry",
]
export const aboutEntrySelectors = [
  'body[data-slug="about/index"] .center > article > *',
  'body[data-slug="about/index"] footer',
]
export const startupStyle = `
@media (prefers-reduced-motion: no-preference) {
  html[data-komei-veil]::before {
    content: ""; position: fixed; inset: 0; z-index: 2147483647;
    background: var(--light, Canvas); color-scheme: light; pointer-events: none;
  }
  html[saved-theme="dark"][data-komei-veil]::before { color-scheme: dark; }
  html[data-komei-veil="exiting"]::before {
    animation: komei-entry-exit 220ms ease-out both;
  }
  ${homeEntrySelectors.map((s) => `html[data-komei-startup-cold="index"] ${s}`).join(",")},
  ${aboutEntrySelectors.map((s) => `html[data-komei-startup-cold="about/index"] ${s}`).join(",")},
  [data-komei-entry] { opacity: 0; visibility: hidden; }
}
@keyframes komei-entry-exit { from { opacity: 1 } to { opacity: 0 } }`

export type StartupRun = {
  targets: HTMLElement[]
  valid: () => boolean
  claim: () => boolean
  handoff: () => void
  complete: (elements: Element[]) => void
  reveal: () => void
  onReveal: (cleanup: () => void) => void
}
export type StartupController = {
  prepare: (slug: string) => StartupRun | undefined
  cancel: () => void
  // A numeric exposure snapshot, not a layout measurement. Late route setup
  // must not animate cards the reader has already passed before its first IO.
  homeViewport: () => Array<{ top: number; bottom: number }> | undefined
}
export type StartupWindow = Window & { komeiStartup?: StartupController }

// Called by a classic, synchronous Head script, not a deferred/module resource.
export function installKomeiStartup(win: Window, doc: Document, initialSlug: string) {
  const host = win as StartupWindow
  if (host.komeiStartup) return
  const root = doc.documentElement
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)")
  const seen = new WeakSet<HTMLElement>()
  const allowed = (slug: string) => slug === "index" || slug === "about/index"
  const key = () => win.location.pathname + win.location.search
  let armed = false
  let sequence = 0
  let current: StartupRun | undefined
  let cold = true
  let lastNavKey = key()
  let homeFrameStarted = false
  let exposed: Array<{ top: number; bottom: number }> | undefined
  let structureObserver: MutationObserver | undefined
  let paintObserver: PerformanceObserver | undefined
  let frame: number | undefined
  let veilTimer: number | undefined
  const veilFinished = (event: AnimationEvent) => {
    if (
      root.dataset.komeiVeil === "exiting" &&
      event.target === root &&
      event.pseudoElement === "::before" &&
      event.animationName === "komei-entry-exit"
    )
      removeVeil()
  }
  const removeVeil = () => {
    root.removeAttribute("data-komei-veil")
    doc.removeEventListener("animationend", veilFinished)
    doc.removeEventListener("animationcancel", veilFinished)
    structureObserver?.disconnect()
    paintObserver?.disconnect()
    if (frame !== undefined) win.cancelAnimationFrame(frame)
    win.clearTimeout(veilTimer)
  }
  const noteViewport = () => {
    if (
      !homeFrameStarted ||
      root.dataset.komeiVeil === "armed" ||
      doc.body?.dataset.slug !== "index"
    )
      return
    const top = win.scrollY
    const bottom = top + win.innerHeight
    const ranges = [...(exposed ?? []), { top, bottom }].sort((a, b) => a.top - b.top)
    exposed = []
    for (const range of ranges) {
      const last = exposed.at(-1)
      if (last && last.bottom >= range.top) last.bottom = Math.max(last.bottom, range.bottom)
      else exposed.push(range)
    }
  }

  function create(slug: string, initial: boolean): StartupRun {
    const token = String(++sequence)
    const route = key()
    const deadline = win.performance.now() + 1200
    let state: "pending" | "claimed" | "revealed" = "pending"
    let container: Element | null = null
    let bound = false
    let cleanup: (() => void) | undefined
    const active = new Set<HTMLElement>()
    const properties = [
      "opacity",
      "visibility",
      "transform",
      "will-change",
      "translate",
      "rotate",
      "scale",
    ]
    const originals = new Map<HTMLElement, Array<[string, string, string]>>()
    const restore = (element: HTMLElement) => {
      element.removeAttribute("data-komei-entry")
      for (const [name, value, priority] of originals.get(element) ?? []) {
        if (value) element.style.setProperty(name, value, priority)
        else element.style.removeProperty(name)
      }
      active.delete(element)
      seen.add(element)
    }
    const reveal = (preserveEmptyPaint = false) => {
      const waitingForPaint =
        preserveEmptyPaint && initial && slug === "index" && root.dataset.komeiVeil === "armed"
      if (!waitingForPaint) {
        if (initial && slug === "index" && root.dataset.komeiVeil === "armed") {
          homeFrameStarted = true
          removeVeil()
        }
        win.clearTimeout(loadTimer)
        win.clearTimeout(watchdog)
      }
      if (state === "revealed") return
      state = "revealed" // Terminal, including when GSAP resolves after this point.
      root.removeAttribute("data-komei-startup-cold")
      root.dataset.komeiStartupState = state
      try {
        cleanup?.()
      } finally {
        // Cleanup may clear GSAP props on already-completed nodes too.
        originals.forEach((_values, element) => restore(element))
      }
    }
    // Both guards exist BEFORE any pending marker is written.
    const loadTimer = win.setTimeout(reveal, 1200)
    const watchdog = win.setTimeout(reveal, 3200)
    root.dataset.komeiStartupState = state
    if (initial) root.dataset.komeiStartupCold = slug

    const valid = () =>
      state !== "revealed" &&
      !reduced.matches &&
      current === run &&
      route === key() &&
      doc.body?.dataset.slug === slug &&
      (!bound || (container?.isConnected && container === doc.querySelector("#quartz-root")))

    const run: StartupRun = {
      targets: [],
      valid: () => Boolean(valid()),
      claim: () => {
        if (
          !valid() ||
          state !== "pending" ||
          win.performance.now() >= deadline ||
          (initial && slug === "index" && homeFrameStarted)
        ) {
          // A missed admission is not an error: it must not punch through the
          // empty frame while its first paint is still pending. Guards remain.
          reveal(
            initial &&
              slug === "index" &&
              win.performance.now() < deadline &&
              (homeFrameStarted || state === "revealed"),
          )
          return false
        }
        state = "claimed"
        root.dataset.komeiStartupState = state
        win.clearTimeout(loadTimer)
        return true
      },
      handoff: () => {
        if (!valid() || state !== "claimed") return reveal()
        // GSAP initial values have been installed synchronously on these hidden nodes.
        active.forEach((element) => element.removeAttribute("data-komei-entry"))
      },
      complete: (elements) => {
        elements.forEach((element) => {
          if (active.has(element as HTMLElement)) restore(element as HTMLElement)
        })
        if (active.size === 0) reveal(true)
      },
      reveal,
      onReveal: (fn) => {
        cleanup = fn
        if (state === "revealed") fn()
      },
    }

    function bind() {
      if (bound || state === "revealed") return
      container = doc.querySelector("#quartz-root")
      const selectors = slug === "index" ? homeEntrySelectors : aboutEntrySelectors
      const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selectors.join(",")))
      for (const element of candidates) {
        if (seen.has(element)) continue
        originals.set(
          element,
          properties.map((name) => [
            name,
            element.style.getPropertyValue(name),
            element.style.getPropertyPriority(name),
          ]),
        )
        active.add(element)
        run.targets.push(element)
        element.dataset.komeiEntry = token
      }
      bound = true
      root.removeAttribute("data-komei-startup-cold")
      if (!container || active.size === 0) reveal()
    }
    // Parsing has not yet produced the cold document's targets.
    const safeBind = () => {
      try {
        bind()
      } catch {
        reveal()
      }
    }
    if (initial) coldBind = safeBind
    else safeBind()
    return run
  }

  let coldBind: (() => void) | undefined
  host.komeiStartup = {
    cancel: () => abandon(),
    homeViewport: () => {
      if (!exposed) return undefined
      win.removeEventListener("scroll", noteViewport)
      return exposed.map((range) => ({ ...range }))
    },
    prepare(slug) {
      if (cold) {
        cold = false
        if (allowed(slug) && slug === initialSlug) coldBind?.()
        else current?.reveal()
        if (slug === "index" && !current?.valid()) {
          // This finite Hero has already fallen back, including a Tab before
          // T0. Remember its actual static DOM, never all route IO candidates.
          try {
            doc
              .querySelectorAll<HTMLElement>(homeEntrySelectors.join(","))
              .forEach((element) => seen.add(element))
          } catch {
            /* Static fallback must remain readable even if discovery fails. */
          }
        }
        if (!armed) return current?.valid() ? current : undefined
      }
      if (!armed) return undefined // Duplicate nav / same already-presented document.
      armed = false
      current?.reveal()
      const previousKey = lastNavKey
      lastNavKey = key()
      if (previousKey === lastNavKey) return undefined
      if (!allowed(slug) || reduced.matches) return undefined
      current = create(slug, false)
      return current.valid() ? current : undefined
    },
  }
  const abandon = () => {
    armed = false
    homeFrameStarted = true
    removeVeil()
    current?.reveal()
  }
  doc.addEventListener("prenav", () => {
    abandon()
    win.removeEventListener("scroll", noteViewport)
    exposed = undefined
    armed = true
  })
  reduced.addEventListener("change", () => {
    if (reduced.matches) abandon()
  })
  win.addEventListener("pagehide", () => {
    abandon()
    win.removeEventListener("scroll", noteViewport)
  })
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) abandon()
  })
  if (allowed(initialSlug) && !reduced.matches) current = create(initialSlug, true)
  if (initialSlug === "index" && !reduced.matches) {
    // Safe Head arming only: no geometry, module, image, font or library wait.
    try {
      const stored = win.localStorage.getItem("theme")
      root.setAttribute(
        "saved-theme",
        stored === "light" || stored === "dark"
          ? stored
          : win.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light",
      )
    } catch {
      root.setAttribute(
        "saved-theme",
        win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      )
    }
    // Normal removal follows the real CSS end, not the exit RAF timestamp.
    // Missing/cancelled events still cannot outlive the original cold guard:
    // this safety clock starts at arm and is never restarted at exit.
    veilTimer = win.setTimeout(removeVeil, 3200)
    doc.addEventListener("animationend", veilFinished)
    doc.addEventListener("animationcancel", veilFinished)
    root.dataset.komeiVeil = "armed"
    const exit = () => {
      frame = undefined
      if (root.dataset.komeiVeil !== "armed") return
      root.dataset.komeiVeil = "exiting"
      if (root.dataset.komeiStartupState === "claimed") current?.complete([])
      else {
        coldBind?.()
        current?.reveal()
      }
      frame = win.requestAnimationFrame(() => {
        frame = undefined
        noteViewport()
      })
    }
    const afterPaint = () => {
      paintObserver?.disconnect()
      if (root.dataset.komeiVeil === "armed") frame = win.requestAnimationFrame(exit)
    }
    const ready = () => {
      if (homeFrameStarted || frame !== undefined) return
      try {
        const hero = doc.querySelector(".komei-home-hero")
        // A following sibling proves the Hero has been parsed. At parser end a
        // Hero-only home is also ready; do not wait for deferred modules/DCL.
        if (!hero || (!hero.nextElementSibling && doc.readyState === "loading")) return
        frame = win.requestAnimationFrame(() => {
          frame = undefined
          if (homeFrameStarted) return
          homeFrameStarted = true // Close Hero admission, NOT a paint boundary.
          structureObserver?.disconnect()
          // A prepaint RAF can precede a long first Layout. Start the 220ms
          // handoff only after a browser paint, not from that earlier clock.
          const painted = (entry: PerformanceEntry) =>
            entry.name === "first-paint" || entry.name === "first-contentful-paint"
          try {
            if (win.performance.getEntriesByType("paint").some(painted)) return afterPaint()
            const Observer = (win as Window & typeof globalThis).PerformanceObserver
            if (typeof Observer !== "function" || !Observer.supportedEntryTypes?.includes("paint"))
              return afterPaint() // next-RAF fallback, including silent unsupported observe()
            paintObserver = new Observer((entries) => {
              if (entries.getEntries().some(painted)) afterPaint()
            })
            paintObserver.observe({ type: "paint", buffered: true })
          } catch {
            afterPaint()
          }
        })
      } catch {
        abandon()
      }
    }
    structureObserver = new (win as Window & typeof globalThis).MutationObserver(ready)
    structureObserver.observe(doc as unknown as Node, { childList: true, subtree: true })
    doc.addEventListener("readystatechange", ready)
    win.addEventListener("scroll", noteViewport, { passive: true })
    ready()
  }
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Tab") abandon()
  })
  doc.addEventListener(
    "pointerdown",
    () => {
      if (root.hasAttribute("data-komei-veil")) abandon()
    },
    { capture: true, passive: true },
  )
  doc.addEventListener("focusin", (event) => {
    if (
      root.hasAttribute("data-komei-veil") ||
      current?.targets.some((element) => element.contains(event.target as Node))
    )
      abandon()
  })
}
