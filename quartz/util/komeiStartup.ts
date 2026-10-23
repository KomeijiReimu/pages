// Only presentation routes participate. Reading routes always remain visible.
import { createHomePrelude, homePreludeStyle, type HomePrelude } from "./komeiPrelude"

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
html[data-komei-font-phase="pending"] body[data-slug="index"],
html[data-komei-font-phase="fallback"] body[data-slug="index"] {
  --headerFont: "Noto Serif CJK SC", "Songti SC", STSong, SimSun, "Times New Roman", serif;
  --bodyFont: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  --titleFont: var(--bodyFont);
}
@media (prefers-reduced-motion: no-preference) {
  ${homeEntrySelectors.map((s) => `html[data-komei-startup-cold="index"] ${s}`).join(",")},
  ${aboutEntrySelectors.map((s) => `html[data-komei-startup-cold="about/index"] ${s}`).join(",")},
  [data-komei-entry] { opacity: 0; visibility: hidden; }
}
${homePreludeStyle}`

export type StartupRun = {
  targets: HTMLElement[]
  valid: () => boolean
  claim: () => boolean
  handoff: (start?: () => void) => void
  complete: (elements: Element[]) => void
  reveal: () => void
  onReveal: (cleanup: () => void) => void
}
export type StartupController = {
  prepare: (slug: string) => StartupRun | undefined
  cancel: () => void
  // Geometry is exposure only after the cold foreground has left (or failed).
  homeOpen: () => boolean
  onHomeOpen: (listener: () => void) => () => void
  // A numeric exposure snapshot, not a layout measurement. Late route setup
  // must not animate cards the reader has already passed before its first IO.
  homeViewport: () => Array<{ top: number; bottom: number }> | undefined
}
export type StartupWindow = Window & { komeiStartup?: StartupController }

// Called by a classic, synchronous Head script, not a deferred/module resource.
export function installKomeiStartup(
  win: Window,
  doc: Document,
  initialSlug: string,
  fontPlan?: Array<{ family: string; weights: number[] }>,
  preludeFactory: (win: Window, doc: Document) => HomePrelude = createHomePrelude,
) {
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
  let homeStructureReady = false
  let homePaintReady = false
  let prelude: HomePrelude | undefined
  let visualStarted = false
  let coldHandoff: { admit: () => boolean; play: () => boolean } | undefined
  let requestHomeVisual: (() => void) | undefined
  const openListeners = new Set<() => void>()
  let exposed: Array<{ top: number; bottom: number }> | undefined
  let structureObserver: MutationObserver | undefined
  let paintObserver: PerformanceObserver | undefined
  let frame: number | undefined
  let veilTimer: number | undefined
  let visualTimer: number | undefined
  let fontTimer: number | undefined
  let fontsStarted = false
  let fontPhase: "pending" | "ready" | "fallback" | undefined =
    initialSlug === "index" && fontPlan?.length ? "pending" : undefined
  const fontPreparationDeadline = win.performance.now() + 3200 - 64
  const settleFonts = (ready: boolean) => {
    if (fontPhase !== "pending") return
    fontPhase = ready ? "ready" : "fallback"
    root.dataset.komeiFontPhase = fontPhase
    win.clearTimeout(fontTimer)
    requestHomeVisual?.()
  }
  const startFonts = () => {
    if (fontPhase !== "pending" || fontsStarted || !doc.body) return
    fontsStarted = true
    const deadline = fontPreparationDeadline
    fontTimer = win.setTimeout(
      () => settleFonts(false),
      Math.max(0, deadline - win.performance.now()),
    )
    try {
      if (!doc.fonts?.load) return settleFonts(false)
      const walker = doc.createTreeWalker(doc.body, 4) // SHOW_TEXT; never read other documents.
      const characters = new Set<string>()
      let node: Node | null
      while ((node = walker.nextNode())) {
        if (
          node.parentElement?.closest(
            "script,style,noscript,template,pre,code,svg,[hidden],[aria-hidden='true']",
          )
        )
          continue
        for (const character of node.textContent ?? "") {
          if (character.trim()) characters.add(character)
        }
      }
      const text = [...characters].join("")
      if (!text) return settleFonts(false)
      const requests = new Set(
        fontPlan!.flatMap(({ family, weights }) =>
          weights.map((weight) => `normal ${weight} 16px ${JSON.stringify(family)}`),
        ),
      )
      void Promise.all([...requests].map((font) => doc.fonts.load(font, text))).then(
        (groups) =>
          settleFonts(
            win.performance.now() < deadline &&
              groups.length > 0 &&
              groups.every(
                (faces) => faces.length > 0 && faces.every((f) => f.status === "loaded"),
              ),
          ),
        () => settleFonts(false),
      )
    } catch {
      settleFonts(false)
    }
  }
  if (fontPhase) {
    root.dataset.komeiFontPhase = fontPhase
    if (reduced.matches) settleFonts(false)
    else doc.addEventListener("DOMContentLoaded", startFonts, { once: true })
  }
  const removeVeil = () => {
    const wasClosed = root.hasAttribute("data-komei-veil")
    root.removeAttribute("data-komei-veil")
    root.removeAttribute("data-komei-prelude")
    const previous = prelude
    prelude = undefined
    coldHandoff = undefined
    requestHomeVisual = undefined
    structureObserver?.disconnect()
    paintObserver?.disconnect()
    if (frame !== undefined) win.cancelAnimationFrame(frame)
    frame = undefined
    win.clearTimeout(veilTimer)
    win.clearTimeout(visualTimer)
    try {
      previous?.dispose()
    } catch {
      // A decorative cleanup failure must not keep the real page gated.
    }
    if (wasClosed) openListeners.forEach((listener) => listener())
  }
  const finishExit = () => {
    if (root.dataset.komeiVeil !== "exiting") return
    removeVeil()
    homeFrameStarted = true
    noteViewport()
  }
  const noteViewport = () => {
    if (
      !homeFrameStarted ||
      root.hasAttribute("data-komei-veil") ||
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
    const coldHome = initial && slug === "index"
    const preparationDeadline = win.performance.now() + 3200
    let deadline = coldHome ? preparationDeadline : win.performance.now() + 1200
    let loading = !coldHome
    let state: "pending" | "claimed" | "revealed" = "pending"
    let container: Element | null = null
    let bound = false
    let cleanup: (() => void) | undefined
    let handedOff = false
    let handoffQueued = false
    let visualAdmitted = false
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
    const reveal = (completed = false) => {
      settleFonts(false)
      // Hero completion does not cut off an overlapping foreground exit. Its
      // gone callback/budget owns that surface, independently of the Hero scope.
      if (coldHome && !(completed && root.dataset.komeiVeil === "exiting")) {
        homeFrameStarted = true
        removeVeil()
        noteViewport()
      }
      win.clearTimeout(loadTimer)
      win.clearTimeout(watchdog)
      if (state === "revealed") return
      state = "revealed" // Terminal, including when GSAP resolves after this point.
      if (root.dataset.komeiHomeDevelop === token) root.removeAttribute("data-komei-home-develop")
      root.removeAttribute("data-komei-startup-cold")
      root.dataset.komeiStartupState = state
      try {
        cleanup?.()
      } finally {
        // Cleanup may clear GSAP props on already-completed nodes too.
        originals.forEach((_values, element) => restore(element))
      }
    }
    // Head bounds preparation even if the consumer module never executes.
    // Only the cold home defers its library budget until the first prepare().
    let loadTimer = coldHome ? undefined : win.setTimeout(reveal, 1200)
    let watchdog = win.setTimeout(reveal, 3200)
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
      handoff: (start) => {
        if (!valid() || state !== "claimed") return reveal()
        if (handedOff || handoffQueued) return
        handoffQueued = true
        const begin = () => {
          if (!valid() || state !== "claimed") {
            reveal()
            return false
          }
          if (handedOff) return false
          if (coldHome && !visualAdmitted && win.performance.now() >= preparationDeadline) {
            reveal()
            return false
          }
          handedOff = true
          win.clearTimeout(watchdog)
          watchdog = win.setTimeout(reveal, 3200)
          if (coldHome) {
            win.clearTimeout(veilTimer)
            win.clearTimeout(fontTimer)
          }
          // CSS and the original paused Timeline start in this same callback;
          // the foreground exit is invoked by the coordinator in the same frame.
          if (slug === "index") root.dataset.komeiHomeDevelop = token
          active.forEach((element) => element.removeAttribute("data-komei-entry"))
          start?.()
          return true
        }
        if (coldHome && root.dataset.komeiVeil === "armed") {
          coldHandoff = {
            admit: () => {
              if (!valid() || (!visualAdmitted && win.performance.now() >= preparationDeadline)) {
                reveal()
                return false
              }
              if (visualAdmitted) return true
              visualAdmitted = true
              win.clearTimeout(watchdog)
              win.clearTimeout(veilTimer)
              win.clearTimeout(fontTimer)
              return true
            },
            play: begin,
          }
          requestHomeVisual?.()
        } else begin()
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
    const safeBind = (startLoading = false) => {
      try {
        if (coldHome && startLoading && !loading && state === "pending") {
          loading = true
          deadline = Math.min(preparationDeadline, win.performance.now() + 1200)
          loadTimer = win.setTimeout(reveal, Math.max(0, deadline - win.performance.now()))
          startFonts()
        }
        bind()
      } catch {
        reveal()
      }
    }
    if (initial) coldBind = safeBind
    else safeBind()
    return run
  }

  let coldBind: ((startLoading?: boolean) => void) | undefined
  host.komeiStartup = {
    cancel: () => abandon(),
    homeOpen: () => !root.hasAttribute("data-komei-veil"),
    onHomeOpen: (listener) => {
      openListeners.add(listener)
      return () => openListeners.delete(listener)
    },
    homeViewport: () => {
      if (!exposed) return undefined
      win.removeEventListener("scroll", noteViewport)
      return exposed.map((range) => ({ ...range }))
    },
    prepare(slug) {
      if (cold) {
        cold = false
        if (allowed(slug) && slug === initialSlug) coldBind?.(true)
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
    settleFonts(false)
    armed = false
    homeFrameStarted = true
    removeVeil()
    noteViewport()
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
    // Preparation is bounded from Head, independently of the first painted frame.
    veilTimer = win.setTimeout(abandon, 3200)
    root.dataset.komeiVeil = "armed"
    const enter = () => {
      frame = undefined
      if (root.dataset.komeiVeil !== "armed" || !coldHandoff || !prelude || visualStarted) return
      if (!coldHandoff.admit()) return
      try {
        const owner = prelude
        const play = coldHandoff.play
        visualStarted = true
        root.dataset.komeiPrelude = "playing"
        // Budgets are failure bounds, never compulsory artistic delays. A
        // factory callback may finish early; repeated handoff cannot renew them.
        visualTimer = win.setTimeout(abandon, owner.enterTimeoutMs)
        owner.enter(() => {
          if (prelude !== owner || root.dataset.komeiVeil !== "armed") return
          try {
            root.dataset.komeiVeil = "exiting"
            win.clearTimeout(visualTimer)
            visualTimer = win.setTimeout(finishExit, owner.exitTimeoutMs)
            if (!play()) return
            if (prelude === owner)
              owner.exit(() => {
                if (prelude === owner) finishExit()
              })
          } catch {
            abandon()
          }
        })
      } catch {
        abandon()
      }
    }
    requestHomeVisual = () => {
      if (
        homeStructureReady &&
        homePaintReady &&
        fontPhase !== "pending" &&
        coldHandoff &&
        frame === undefined &&
        prelude &&
        !visualStarted &&
        root.dataset.komeiVeil === "armed"
      ) {
        frame = win.requestAnimationFrame(enter)
      }
    }
    const afterPaint = () => {
      if (homePaintReady) return
      paintObserver?.disconnect()
      homePaintReady = true
      if (root.dataset.komeiVeil !== "armed") return
      requestHomeVisual?.()
    }
    const ready = () => {
      if (homeFrameStarted || homeStructureReady || frame !== undefined) return
      try {
        const hero = doc.querySelector(".komei-home-hero")
        // A following sibling proves the Hero has been parsed. At parser end a
        // Hero-only home is also ready; do not wait for deferred modules/DCL.
        if (!hero || (!hero.nextElementSibling && doc.readyState === "loading")) return
        frame = win.requestAnimationFrame(() => {
          frame = undefined
          if (homeFrameStarted) return
          homeStructureReady = true
          structureObserver?.disconnect()
          coldBind?.()
          if (root.dataset.komeiVeil !== "armed") return
          // Mount only a static decorative base while preparing. Its motion is
          // admitted below only after paint, claimed Hero initials and fonts.
          // On any preparation failure reveal() disposes it without playing.
          try {
            prelude = preludeFactory(win, doc)
          } catch {
            abandon()
            return
          }
          // Paint and prepared Hero initials are independent prerequisites.
          // Neither parsing nor a first paint closes library admission early.
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
    if (event.key === "Escape") abandon()
  })
  doc.addEventListener("focusin", (event) => {
    if (
      current?.targets.some((element) => element.contains(event.target as Node)) ||
      (prelude && (event.target as Element | null)?.matches?.(":focus-visible"))
    )
      abandon()
  })
}
