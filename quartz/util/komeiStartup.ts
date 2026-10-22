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
html[data-komei-font-phase="pending"] body[data-slug="index"],
html[data-komei-font-phase="fallback"] body[data-slug="index"] {
  --headerFont: "Noto Serif CJK SC", "Songti SC", STSong, SimSun, "Times New Roman", serif;
  --bodyFont: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  --titleFont: var(--bodyFont);
}
@media (prefers-reduced-motion: no-preference) {
  html[data-komei-veil] {
    --komei-entry-ground: #e8efeb;
    --komei-entry-deep: #a7c4bd;
    --komei-entry-ink: #497b76;
    --komei-entry-shine: #fff9e9;
  }
  html[saved-theme="dark"][data-komei-veil] {
    --komei-entry-ground: #142d34;
    --komei-entry-deep: #31565d;
    --komei-entry-ink: #80aaa5;
    --komei-entry-shine: #b6cfc3;
    color-scheme: dark;
  }
  html[data-komei-veil]::before {
    content: ""; position: fixed; inset: 0; z-index: 2147483646;
    background: var(--komei-entry-ground);
    pointer-events: none;
  }
  .komei-prelude {
    position: fixed; inset: 0; z-index: 2147483647; overflow: hidden;
    pointer-events: none; user-select: none; contain: strict;
    background: radial-gradient(ellipse at 38% 58%, var(--komei-entry-deep), transparent 66%), var(--komei-entry-ground);
  }
  .komei-prelude__orbit {
    position: absolute; top: 50%; left: 43%; width: 92vmax; height: 42vmax;
    border: 1px solid var(--komei-entry-ink); border-radius: 50%;
    background: linear-gradient(165deg, transparent 35%, color-mix(in srgb, var(--komei-entry-shine) 34%, transparent) 70%, transparent);
    box-shadow: inset 0 -1px var(--komei-entry-shine), 0 28px 70px -50px var(--komei-entry-ink);
    opacity: 0; transform: translate(-50%, -50%) rotate(-38deg) scale(.3, .04);
    --orbit-turn: -28deg; --orbit-scale: 1; --orbit-delay: 0ms;
  }
  .komei-prelude__orbit:nth-child(2) {
    --orbit-turn: -12deg; --orbit-scale: .78; --orbit-delay: 100ms;
  }
  .komei-prelude__orbit:nth-child(3) {
    --orbit-turn: 8deg; --orbit-scale: .56; --orbit-delay: 200ms;
  }
  .komei-prelude__light {
    position: absolute; inset: -50%; opacity: 0;
    background: linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--komei-entry-shine) 55%, transparent) 49%, transparent 58%);
    transform: translateX(-35%);
  }
  html[data-komei-prelude] .komei-prelude__orbit {
    animation: komei-prelude-unfold 1000ms var(--orbit-delay) cubic-bezier(.2,.7,.18,1) both;
  }
  html[data-komei-prelude] .komei-prelude__light {
    animation: komei-prelude-light 2400ms 180ms ease-in-out infinite alternate;
  }
  html[data-komei-veil="exiting"]::before,
  html[data-komei-veil="exiting"] .komei-prelude {
    animation: komei-entry-exit 650ms cubic-bezier(.76,0,.24,1) both;
  }
  @media (max-width: 600px) {
    .komei-prelude__orbit { left: 40%; width: 108vmax; height: 54vmax; }
  }
  ${homeEntrySelectors.map((s) => `html[data-komei-startup-cold="index"] ${s}`).join(",")},
  ${aboutEntrySelectors.map((s) => `html[data-komei-startup-cold="about/index"] ${s}`).join(",")},
  [data-komei-entry] { opacity: 0; visibility: hidden; }
}
@keyframes komei-entry-exit {
  from { transform: translateY(0); }
  to { transform: translateY(-100%); }
}
@keyframes komei-prelude-unfold {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(-38deg) scale(.3, .04); }
  28% { opacity: .85; }
  100% { opacity: .75; transform: translate(-50%, -50%) rotate(var(--orbit-turn)) scale(var(--orbit-scale)); }
}
@keyframes komei-prelude-light {
  0% { opacity: 0; transform: translateX(-35%); }
  45% { opacity: .8; }
  100% { opacity: .25; transform: translateX(25%); }
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
export type StartupController = {
  prepare: (slug: string) => StartupRun | undefined
  cancel: () => void
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
  let preludeReady = false
  let preludeDeadline: number | undefined
  let prelude: HTMLElement | undefined
  let coldHandoff: { admit: () => boolean; play: () => void } | undefined
  let requestHomeExit: (() => void) | undefined
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
    requestHomeExit?.()
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
  const veilFinished = (event: AnimationEvent) => {
    if (
      root.dataset.komeiVeil === "exiting" &&
      event.target === root &&
      event.pseudoElement === "::before" &&
      event.animationName === "komei-entry-exit"
    ) {
      if (event.type === "animationcancel") abandon()
      else finishExit()
    }
  }
  const removeVeil = () => {
    root.removeAttribute("data-komei-veil")
    root.removeAttribute("data-komei-prelude")
    prelude?.remove()
    prelude = undefined
    coldHandoff = undefined
    requestHomeExit = undefined
    doc.removeEventListener("animationend", veilFinished)
    doc.removeEventListener("animationcancel", veilFinished)
    structureObserver?.disconnect()
    paintObserver?.disconnect()
    if (frame !== undefined) win.cancelAnimationFrame(frame)
    frame = undefined
    win.clearTimeout(veilTimer)
    win.clearTimeout(visualTimer)
  }
  const finishExit = () => {
    if (root.dataset.komeiVeil !== "exiting") return
    const play = coldHandoff?.play
    removeVeil()
    homeFrameStarted = true
    noteViewport()
    try {
      play?.()
    } catch {
      abandon()
    }
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
    const reveal = (preserveEmptyPaint = false) => {
      settleFonts(false)
      const waitingForPaint =
        preserveEmptyPaint && initial && slug === "index" && root.dataset.komeiVeil === "armed"
      if (!waitingForPaint) {
        if (coldHome && root.hasAttribute("data-komei-veil")) {
          homeFrameStarted = true
          removeVeil()
          noteViewport()
        }
        win.clearTimeout(loadTimer)
        win.clearTimeout(watchdog)
      }
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
          if (!valid() || state !== "claimed" || handedOff) return
          if (coldHome && !visualAdmitted && win.performance.now() >= preparationDeadline)
            return reveal()
          handedOff = true
          if (coldHome) {
            win.clearTimeout(watchdog)
            watchdog = win.setTimeout(reveal, 3200)
            win.clearTimeout(veilTimer)
            win.clearTimeout(fontTimer)
          }
          // The foreground is gone before the paused Hero's clock starts.
          if (slug === "index") root.dataset.komeiHomeDevelop = token
          active.forEach((element) => element.removeAttribute("data-komei-entry"))
          start?.()
        }
        if (initial && slug === "index" && root.dataset.komeiVeil === "armed") {
          coldHandoff = {
            admit: () => {
              if (!valid() || (!visualAdmitted && win.performance.now() >= preparationDeadline)) {
                reveal()
                return false
              }
              if (visualAdmitted) return true
              visualAdmitted = true
              // Painted unfolding already has a clock. Transfer preparation to
              // its remaining time + exit bound + one 64ms RAF delivery margin.
              // Repeated admission never renews this finite visual guard.
              win.clearTimeout(watchdog)
              watchdog = win.setTimeout(
                reveal,
                Math.max(0, preludeDeadline! - win.performance.now()) + 740 + 64,
              )
              win.clearTimeout(veilTimer)
              win.clearTimeout(fontTimer)
              return true
            },
            play: begin,
          }
          requestHomeExit?.()
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
    doc.addEventListener("animationend", veilFinished)
    doc.addEventListener("animationcancel", veilFinished)
    root.dataset.komeiVeil = "armed"
    const exit = () => {
      frame = undefined
      if (root.dataset.komeiVeil !== "armed" || !coldHandoff) return
      if (!coldHandoff.admit()) return
      root.dataset.komeiVeil = "exiting"
      // One reused visual clock: 1200ms unfolding, then a 650ms CSS exit with
      // 90ms event-delivery grace. Missing CSS events cannot strand the surface.
      visualTimer = win.setTimeout(finishExit, 740)
    }
    requestHomeExit = () => {
      if (
        homeStructureReady &&
        homePaintReady &&
        preludeDeadline !== undefined &&
        fontPhase !== "pending" &&
        coldHandoff &&
        frame === undefined &&
        root.dataset.komeiVeil === "armed"
      ) {
        if (!coldHandoff.admit()) return
        if (preludeReady) frame = win.requestAnimationFrame(exit)
      }
    }
    const afterPaint = () => {
      if (homePaintReady) return
      paintObserver?.disconnect()
      homePaintReady = true
      if (root.dataset.komeiVeil !== "armed") return
      // A separate RAF also guarantees a rendered base in browsers without
      // Paint Timing. Warm caches must still see the complete foreground motion.
      frame = win.requestAnimationFrame(() => {
        frame = undefined
        if (root.dataset.komeiVeil !== "armed") return
        root.dataset.komeiPrelude = "playing"
        preludeDeadline = win.performance.now() + 1200
        visualTimer = win.setTimeout(() => {
          preludeReady = true
          requestHomeExit?.()
        }, 1200)
        requestHomeExit?.()
      })
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
          // Purely decorative, born only on a cold animated home. No semantics,
          // focus stops, resource requests or independent animation controller.
          prelude = doc.createElement("div")
          prelude.className = "komei-prelude"
          prelude.setAttribute("aria-hidden", "true")
          for (const className of ["orbit", "orbit", "orbit", "light"]) {
            const layer = doc.createElement("span")
            layer.className = `komei-prelude__${className}`
            prelude.appendChild(layer)
          }
          doc.body.appendChild(prelude)
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
    if (event.key === "Tab" || root.hasAttribute("data-komei-veil")) abandon()
  })
  doc.addEventListener(
    "wheel",
    () => {
      if (root.hasAttribute("data-komei-veil")) abandon()
    },
    { capture: true, passive: true },
  )
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
