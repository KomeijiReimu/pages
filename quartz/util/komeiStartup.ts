// Only presentation routes participate. Reading routes always remain visible.
export const homeEntrySelectors = [
  ".komei-home-hero",
  ".komei-post-cards",
  ".komei-category-overview",
  ".komei-tag-cloud-section",
  ".komei-home-modules",
  ".komei-home-gallery",
]
export const aboutEntrySelectors = [
  'body[data-slug="about/index"] .center > article > *',
  'body[data-slug="about/index"] footer',
]
export const startupStyle = `
@media (prefers-reduced-motion: no-preference) {
  ${homeEntrySelectors.map((s) => `html[data-komei-startup-cold="index"] ${s}`).join(",")},
  ${aboutEntrySelectors.map((s) => `html[data-komei-startup-cold="about/index"] ${s}`).join(",")},
  [data-komei-entry] { opacity: 0; visibility: hidden; }
}`

export type StartupRun = {
  targets: HTMLElement[]
  valid: () => boolean
  claim: () => boolean
  handoff: () => void
  complete: (elements: Element[]) => void
  reveal: () => void
  onReveal: (cleanup: () => void) => void
}
export type StartupController = { prepare: (slug: string) => StartupRun | undefined }
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

  function create(slug: string, initial: boolean): StartupRun {
    const token = String(++sequence)
    const route = key()
    const deadline = win.performance.now() + 1200
    let state: "pending" | "claimed" | "revealed" = "pending"
    let container: Element | null = null
    let bound = false
    let cleanup: (() => void) | undefined
    const active = new Set<HTMLElement>()
    const properties = ["opacity", "visibility", "transform", "will-change"]
    const originals = new Map<HTMLElement, Array<[string, string, string]>>()
    const restore = (element: HTMLElement) => {
      element.removeAttribute("data-komei-entry")
      for (const [name, value, priority] of originals.get(element) ?? []) {
        if (value) element.style.setProperty(name, value, priority)
        else element.style.removeProperty(name)
      }
      active.delete(element)
    }
    const reveal = () => {
      if (state === "revealed") return
      state = "revealed" // Terminal, including when GSAP resolves after this point.
      win.clearTimeout(loadTimer)
      win.clearTimeout(watchdog)
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
        if (!valid() || state !== "pending" || win.performance.now() >= deadline) {
          reveal()
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
        if (active.size === 0) reveal()
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
        if (!initial && seen.has(element)) continue
        seen.add(element)
        if (slug === "index") {
          const rect = element.getBoundingClientRect()
          // Only the arriving viewport participates. Offscreen sections stay
          // readable at rest and never wait for a later hide/reveal cycle.
          if (
            rect.bottom <= 0 ||
            rect.top >= win.innerHeight ||
            rect.right <= 0 ||
            rect.left >= win.innerWidth
          )
            continue
        }
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
    prepare(slug) {
      if (cold) {
        cold = false
        if (allowed(slug) && slug === initialSlug) coldBind?.()
        else current?.reveal()
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
    current?.reveal()
  }
  // Reveal before Tab's default action so a short presentation gate never
  // skips the body's controls or leaves keyboard focus on an invisible link.
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && doc.body?.dataset.slug === "index") abandon()
  })
  doc.addEventListener("focusin", (event) => {
    if (
      doc.body?.dataset.slug === "index" &&
      current?.targets.some((element) => element.contains(event.target as Node))
    )
      abandon()
  })
  doc.addEventListener("prenav", () => {
    abandon()
    armed = true
  })
  reduced.addEventListener("change", () => {
    if (reduced.matches) abandon()
  })
  win.addEventListener("pagehide", abandon)
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) abandon()
  })
  if (allowed(initialSlug) && !reduced.matches) current = create(initialSlug, true)
}
