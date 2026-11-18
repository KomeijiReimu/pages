// Independent cards, never both a gallery shell and its descendants.
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
const aboutEntrySelectors = [
  'body[data-slug="about/index"] .center > article > *',
  'body[data-slug="about/index"] footer',
]
export const startupStyle = `
html[data-komei-font-phase="fallback"] body[data-slug="index"] {
  --headerFont: "Noto Serif CJK SC", "Songti SC", STSong, SimSun, "Times New Roman", serif;
  --bodyFont: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  --titleFont: var(--bodyFont);
}
@media (prefers-reduced-motion: no-preference) {
  ${aboutEntrySelectors.map((s) => `html[data-komei-startup-cold="about/index"] ${s}`).join(",")},
  body[data-slug="about/index"] [data-komei-entry] { opacity: 0; visibility: hidden; }
}`

export type StartupRun = {
  targets: HTMLElement[]
  valid: () => boolean
  claim: () => boolean
  handoff: (start?: () => void) => void
  complete: (elements: Element[]) => void
  reveal: () => void
  onReveal: (cleanup: () => void) => void
}
type Viewport = { top: number; bottom: number }
export type StartupController = {
  prepare: (slug: string) => StartupRun | undefined
  cancel: () => void
  homeViewport: () => Viewport[] | undefined
}
export type StartupWindow = Window & { komeiStartup?: StartupController }

// A synchronous classic Head script. No DOM, font, image or library wait.
export function installKomeiStartup(win: Window, doc: Document, initialSlug: string) {
  const host = win as StartupWindow
  if (host.komeiStartup) return
  const root = doc.documentElement
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)")
  const key = () => win.location.pathname + win.location.search
  let route = key()
  let armed = false
  let current: StartupRun | undefined
  let bindAbout: (() => void) | undefined
  const seen = new WeakSet<HTMLElement>()

  function createAbout(cold: boolean) {
    const loadDeadline = win.performance.now() + 1200
    const originalRoute = key()
    let state: "pending" | "claimed" | "revealed" = "pending"
    let container: Element | null = null
    let cleanup: (() => void) | undefined
    let started = false
    const active = new Set<HTMLElement>()
    const originals = new Map<HTMLElement, Array<[string, string, string]>>()
    const restore = (element: HTMLElement) => {
      element.removeAttribute("data-komei-entry")
      for (const [name, value, priority] of originals.get(element)!) {
        if (value) element.style.setProperty(name, value, priority)
        else element.style.removeProperty(name)
      }
      active.delete(element)
      seen.add(element)
    }
    const reveal = () => {
      if (state === "revealed") return
      state = "revealed"
      win.clearTimeout(loadTimer)
      win.clearTimeout(watchdog)
      root.removeAttribute("data-komei-startup-cold")
      root.dataset.komeiStartupState = state
      try {
        cleanup?.()
      } finally {
        // GSAP cleanup may also clear props on already-completed nodes.
        originals.forEach((_values, element) => restore(element))
        originals.clear()
      }
    }
    const loadTimer = win.setTimeout(reveal, 1200)
    let watchdog = win.setTimeout(reveal, 3200)
    const run: StartupRun = {
      targets: [],
      valid: () =>
        state !== "revealed" &&
        !reduced.matches &&
        current === run &&
        originalRoute === key() &&
        doc.body?.dataset.slug === "about/index" &&
        !!container?.isConnected &&
        container === doc.querySelector("#quartz-root"),
      claim: () => {
        if (!run.valid() || state !== "pending" || win.performance.now() >= loadDeadline) {
          reveal()
          return false
        }
        state = "claimed"
        root.dataset.komeiStartupState = state
        win.clearTimeout(loadTimer)
        return true
      },
      handoff: (start) => {
        if (!run.valid() || state !== "claimed") return reveal()
        if (started) return
        started = true
        win.clearTimeout(watchdog)
        watchdog = win.setTimeout(reveal, 3200)
        active.forEach((element) => element.removeAttribute("data-komei-entry"))
        start?.()
      },
      complete: (elements) => {
        for (const element of elements) {
          if (active.has(element as HTMLElement)) restore(element as HTMLElement)
        }
        if (!active.size) reveal()
      },
      reveal,
      onReveal: (fn) => {
        if (state === "revealed") fn()
        else cleanup = fn
      },
    }
    current = run
    root.dataset.komeiStartupState = state
    if (cold) root.dataset.komeiStartupCold = "about/index"
    bindAbout = () => {
      if (state === "revealed") return
      try {
        container = doc.querySelector("#quartz-root")
        const properties = [
          "opacity",
          "visibility",
          "transform",
          "will-change",
          "translate",
          "rotate",
          "scale",
        ]
        for (const element of doc.querySelectorAll<HTMLElement>(aboutEntrySelectors.join(","))) {
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
          element.dataset.komeiEntry = ""
        }
        root.removeAttribute("data-komei-startup-cold")
        if (!container || !active.size) reveal()
      } catch {
        reveal() // Discovery failure must leave even partially bound content readable.
      }
    }
  }

  // Only until the inline route observer takes over. Record numbers, not cards:
  // a scrollbar jump is two disjoint viewports, not exposure of everything between.
  let takeViewport: (() => Viewport[] | undefined) | undefined
  if (initialSlug === "index") {
    // Our Head runs before the theme's @font-face rules and the home text exist.
    // fonts.check() could succeed with *no* registered face. Lock the old local
    // fallback before first content; never ask a later font event to switch it.
    root.dataset.komeiFontPhase = "fallback"
    const leaveColdHome = () => {
      if (doc.body?.dataset.slug === "index") return
      root.removeAttribute("data-komei-font-phase")
      doc.removeEventListener("nav", leaveColdHome)
    }
    doc.addEventListener("nav", leaveColdHome)
    let theme: string | null = null
    try {
      theme = win.localStorage.getItem("theme")
    } catch {
      // Storage denied: use the system choice, just like the theme controller.
    }
    root.setAttribute(
      "saved-theme",
      theme === "light" || theme === "dark"
        ? theme
        : win.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
    )
    if (!reduced.matches) {
      const navigation = win.performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined
      if (
        navigation?.type !== "back_forward" &&
        (!doc.referrer || new URL(doc.referrer).origin !== win.location.origin)
      ) {
        root.dataset.komeiHomeSignature = ""
      }
      const ranges: Viewport[] = []
      const noteViewport = () => {
        if (doc.body?.dataset.slug !== "index" || doc.visibilityState === "hidden") return
        const top = win.scrollY
        const bottom = top + win.innerHeight
        let i = ranges.findIndex((r) => r.bottom >= top)
        if (i === -1) i = ranges.length
        let end = i
        let startY = top,
          endY = bottom
        while (end < ranges.length && ranges[end].top <= endY) {
          startY = Math.min(startY, ranges[end].top)
          endY = Math.max(endY, ranges[end++].bottom)
        }
        ranges.splice(i, end - i, { top: startY, bottom: endY })
      }
      // Snapshot a rendered viewport, not an assumed y=0 in the parser. The
      // route can take ownership before first paint, with no exposure to report.
      let frame = win.requestAnimationFrame(() => {
        frame = win.requestAnimationFrame(noteViewport)
      })
      win.addEventListener("scroll", noteViewport, { passive: true })
      win.addEventListener("resize", noteViewport)
      takeViewport = () => {
        win.cancelAnimationFrame(frame)
        win.removeEventListener("scroll", noteViewport)
        win.removeEventListener("resize", noteViewport)
        if (win.performance.getEntriesByName("first-contentful-paint").length) noteViewport()
        takeViewport = undefined
        return ranges.length ? ranges : undefined
      }
    }
  }

  const cancel = () => {
    armed = false
    bindAbout = undefined
    current?.reveal()
    current = undefined
    takeViewport?.()
    root.removeAttribute("data-komei-home-signature")
  }
  host.komeiStartup = {
    cancel,
    homeViewport: () => takeViewport?.(),
    prepare(slug) {
      if (armed) {
        armed = false
        const changed = route !== key()
        route = key()
        if (changed && slug === "about/index" && !reduced.matches) createAbout(false)
      }
      if (!bindAbout) return undefined
      if (slug === "about/index") bindAbout()
      else current?.reveal()
      bindAbout = undefined
      return current?.valid() ? current : undefined
    },
  }
  doc.addEventListener("prenav", () => {
    cancel()
    armed = true
  })
  reduced.addEventListener("change", () => {
    if (reduced.matches) cancel()
  })
  win.addEventListener("pagehide", cancel)
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) cancel()
  })
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") current?.reveal()
  })
  doc.addEventListener("focusin", (event) => {
    if (current?.targets.some((element) => element.contains(event.target as Node))) current.reveal()
  })
  if (initialSlug === "about/index" && !reduced.matches) createAbout(true)
}
