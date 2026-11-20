import { savedScrollEntry, scrollDestination } from "../components/scripts/scrollHistory"

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
  let restoredViewport: Viewport | undefined
  let clearInkPrepaint: (() => void) | undefined
  if (initialSlug === "index") {
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
        navigation?.type === "navigate" &&
        doc.visibilityState === "visible" &&
        !win.location.hash &&
        !savedScrollEntry(win) &&
        win.scrollY === 0
      ) {
        const ref = doc.referrer ? new URL(doc.referrer) : undefined
        if (!ref || ref.origin !== win.location.origin) {
          if (doc.readyState === "loading") {
            root.dataset.komeiHomeSignature = "cold"
            root.dataset.inkPrepaint = ""
            // Only the pen is paused. Give the parsed hero a paint before its clock runs.
            let frame: number | undefined
            const startInk = () => {
              frame = win.requestAnimationFrame(() => {
                frame = win.requestAnimationFrame(() => {
                  if (win.scrollY !== 0 || win.location.hash)
                    root.removeAttribute("data-komei-home-signature")
                  clearInkPrepaint?.()
                })
              })
            }
            doc.addEventListener("DOMContentLoaded", startInk, { once: true })
            clearInkPrepaint = () => {
              doc.removeEventListener("DOMContentLoaded", startInk)
              if (frame !== undefined) win.cancelAnimationFrame(frame)
              root.removeAttribute("data-ink-prepaint")
              clearInkPrepaint = undefined
            }
          }
        } else {
          // Fresh same-site documents include opening the brand in a new tab.
          // Ignore references to home aliases, other deployment roots and hashes.
          const homePath = (path: string) => path.replace(/\/(?:index(?:\.html)?\/?)?$/, "")
          if (homePath(ref.pathname).startsWith(homePath(win.location.pathname) + "/")) {
            root.dataset.komeiHomeSignature = "return"
          }
        }
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
    restoredViewport = undefined
    root.removeAttribute("data-komei-home-signature")
    clearInkPrepaint?.()
  }
  host.komeiStartup = {
    cancel,
    homeViewport: () => {
      const ranges = takeViewport?.()
      if (!restoredViewport) return ranges
      const all = [...(ranges ?? []), restoredViewport]
      restoredViewport = undefined
      return all
    },
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
  doc.addEventListener("nav", (event) => {
    const nav = event.detail?.navigation
    if (!nav || doc.body?.dataset.slug !== "index" || reduced.matches) return
    const { source, position, from } = nav
    if (source === "history" || position || win.location.hash) {
      // IO takes over during nav, before the router applies the destination.
      // Already-visible cards at the restored reading position must stay readable.
      const top = scrollDestination(win, new URL(win.location.href), position).y
      restoredViewport = { top, bottom: top + win.innerHeight }
    }
    if (!from || from === "index" || win.location.hash || doc.visibilityState !== "visible") return
    if (source === "link" || (source === "history" && position?.y === 0)) {
      root.dataset.komeiHomeSignature = "return"
    }
  })
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") {
      root.removeAttribute("data-komei-home-signature")
      clearInkPrepaint?.()
    }
  })
  reduced.addEventListener("change", () => {
    if (reduced.matches) cancel()
  })
  let cachedHomeEntry: string | undefined
  win.addEventListener("pagehide", (event) => {
    cachedHomeEntry =
      event.persisted && doc.body?.dataset.slug === "index" && win.scrollY === 0
        ? savedScrollEntry(win)?.id
        : undefined
    cancel()
  })
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      cancel()
      const entry = savedScrollEntry(win)
      if (
        cachedHomeEntry &&
        entry?.id === cachedHomeEntry &&
        event.isTrusted &&
        !reduced.matches &&
        !win.location.hash &&
        doc.visibilityState === "visible" &&
        doc.body?.dataset.slug === "index" &&
        entry.position?.y === 0 &&
        win.scrollY === 0
      )
        root.dataset.komeiHomeSignature = "return"
    }
    cachedHomeEntry = undefined
  })
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") current?.reveal()
  })
  doc.addEventListener("focusin", (event) => {
    if (current?.targets.some((element) => element.contains(event.target as Node))) current.reveal()
  })
  if (initialSlug === "about/index" && !reduced.matches) createAbout(true)
}
