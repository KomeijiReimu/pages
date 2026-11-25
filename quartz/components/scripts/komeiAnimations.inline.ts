import { homeRevealSelectors, type StartupRun, type StartupWindow } from "../../util/komeiStartup"
;(() => {
  type KomeiGsapAnimation = { kill?: () => void }
  type KomeiGsap = {
    defaults: (vars: Record<string, unknown>) => void
    set: (targets: unknown, vars: Record<string, unknown>) => KomeiGsapAnimation
    to: (targets: unknown, vars: Record<string, unknown>) => KomeiGsapAnimation
    fromTo: (
      targets: unknown,
      fromVars: Record<string, unknown>,
      toVars: Record<string, unknown>,
      position?: string | number,
    ) => KomeiGsapAnimation
  }

  const getGsap = () => (window as Window & { gsap?: KomeiGsap }).gsap
  const rootFlag = "data-komei-gsap-script-bound"
  if (document.documentElement.getAttribute(rootFlag) === "true") return
  document.documentElement.setAttribute(rootFlag, "true")

  const GSAP_SRC = "/static/vendor/gsap.min.js"
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let gsapLoading: Promise<KomeiGsap | undefined> | undefined
  const homePresented = new WeakSet<HTMLElement>()
  let homeRoute: { container: Element; dispose: () => void } | undefined
  const cleanupHome = () => homeRoute?.dispose()

  const animationAllowed = (slug: string) => slug === "index" || slug === "about/index"

  const loadGsap = () => {
    const existingGsap = getGsap()
    if (existingGsap) return Promise.resolve(existingGsap)
    if (gsapLoading) return gsapLoading

    gsapLoading = new Promise<KomeiGsap | undefined>((resolve, reject) => {
      const existing = document.querySelector('script[data-komei-gsap="core"]')
      if (existing) {
        existing.addEventListener("load", () => resolve(getGsap()), { once: true })
        existing.addEventListener("error", reject, { once: true })
        return
      }

      const script = document.createElement("script")
      script.src = GSAP_SRC
      script.defer = true
      script.dataset.komeiGsap = "core"
      script.onload = () => resolve(getGsap())
      script.onerror = (error) => {
        script.remove()
        reject(error)
      }
      document.head.appendChild(script)
    }).catch((error) => {
      gsapLoading = undefined
      throw error
    })

    return gsapLoading
  }

  const createScope = () => {
    let disposed = false
    const cleanups: Array<() => void> = []
    const timelines: KomeiGsapAnimation[] = []
    const observers: IntersectionObserver[] = []
    const mutationObservers: MutationObserver[] = []
    const listeners: Array<() => void> = []

    const addListener = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      eventName: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(eventName, handler, options)
      listeners.push(() => target.removeEventListener(eventName, handler, options))
    }

    const cleanup = () => {
      if (disposed) return
      disposed = true
      timelines.forEach((timeline) => timeline?.kill?.())
      observers.forEach((observer) => observer.disconnect())
      mutationObservers.forEach((observer) => observer.disconnect())
      listeners.forEach((remove) => remove())
      cleanups.forEach((fn) => fn())
    }

    return { cleanups, timelines, observers, mutationObservers, addListener, cleanup }
  }

  const setAnimatedLayer = (_gsap: KomeiGsap, elements: Element[]) => {
    const properties = [
      "transform",
      "opacity",
      "visibility",
      "will-change",
      "translate",
      "rotate",
      "scale",
    ]
    const originals = elements
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => ({
        element,
        values: properties.map((name) => [
          name,
          element.style.getPropertyValue(name),
          element.style.getPropertyPriority(name),
        ]),
      }))
    elements.forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      element.style.willChange = "transform, opacity"
    })
    // Native restoration must also work while the GSAP clock is paused. Never
    // enqueue a zero-duration setter during release.
    return () =>
      originals.forEach(({ element, values }) =>
        values.forEach(([name, value, priority]) => {
          if (value) element.style.setProperty(name, value, priority)
          else element.style.removeProperty(name)
        }),
      )
  }

  type KomeiAnimationScope = ReturnType<typeof createScope>
  type BatchOptions = {
    y?: number
    duration?: number
    ease?: string
    stagger?: number
    rootMargin?: string
    threshold?: number
  }

  const animateBatchOnEnter = (
    gsap: KomeiGsap,
    scope: KomeiAnimationScope,
    run: StartupRun,
    selector: string,
    options: BatchOptions = {},
  ) => {
    const elements = Array.from(document.querySelectorAll(selector)).filter(
      (element) => element instanceof HTMLElement && run.targets.includes(element),
    )

    if (elements.length === 0) return
    if (reduceMotion.matches) {
      scope.timelines.push(
        gsap.set(elements, { autoAlpha: 1, clearProps: "transform,opacity,visibility" }),
      )
      return
    }

    scope.cleanups.push(setAnimatedLayer(gsap, elements))
    scope.timelines.push(gsap.set(elements, { autoAlpha: 0, y: options.y ?? 26, lazy: false }))

    const observer = new IntersectionObserver(
      (entries) => {
        const entered = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target)
          .filter((element) => element instanceof HTMLElement)

        if (entered.length === 0 || !run.valid()) return

        entered.forEach((element) => observer.unobserve(element))
        const tween = gsap.to(entered, {
          autoAlpha: 1,
          y: 0,
          duration: options.duration ?? 0.62,
          ease: options.ease ?? "power3.out",
          stagger: options.stagger ?? 0.08,
          overwrite: "auto",
          clearProps: "transform,opacity,visibility,willChange",
          onComplete: () => run.complete(entered),
        })
        scope.timelines.push(tween)
      },
      {
        rootMargin: options.rootMargin ?? "0px 0px -12% 0px",
        threshold: options.threshold ?? 0.12,
      },
    )

    elements.forEach((element) => observer.observe(element))
    scope.observers.push(observer)
  }

  const setupMusicInteractions = (gsap: KomeiGsap, interactions: KomeiAnimationScope) => {
    const musicPlayers = Array.from(document.querySelectorAll(".komei-music-player"))
    musicPlayers.forEach((player) => {
      const playButton = player.querySelector("[data-komei-music-play]")
      if (!(playButton instanceof HTMLButtonElement)) return

      const handleClick = () => {
        const tween = gsap.fromTo(
          playButton,
          { scale: 0.96 },
          { scale: 1, duration: 0.32, ease: "back.out(2)", clearProps: "transform" },
        )
        interactions.timelines.push(tween)
      }
      interactions.addListener(playButton, "click", handleClick)

      const statePulse = () => {
        if (reduceMotion.matches) return
        if (player.classList.contains("is-buffering")) {
          const ring = player.querySelector(".komei-music-player__play-ring")
          if (ring) {
            const tween = gsap.fromTo(
              ring,
              { scale: 0.94, autoAlpha: 0.72 },
              {
                scale: 1,
                autoAlpha: 1,
                duration: 0.58,
                ease: "sine.inOut",
                clearProps: "transform,opacity,visibility",
              },
            )
            interactions.timelines.push(tween)
          }
        } else if (player.classList.contains("is-error")) {
          const tween = gsap.fromTo(
            player,
            { x: -3 },
            { x: 0, duration: 0.34, ease: "elastic.out(1, 0.45)", clearProps: "transform" },
          )
          interactions.timelines.push(tween)
        }
      }

      const observer = new MutationObserver(statePulse)
      observer.observe(player, { attributes: true, attributeFilter: ["class"] })
      interactions.mutationObservers.push(observer)
    })
  }

  const setupAbout = (gsap: KomeiGsap, scope: KomeiAnimationScope, run: StartupRun) => {
    animateBatchOnEnter(
      gsap,
      scope,
      run,
      'body[data-slug="about/index"] .center > article > *, body[data-slug="about/index"] footer',
      { y: 22, stagger: 0.05, rootMargin: "0px 0px -8% 0px" },
    )
  }

  const setupHomeReveals = (scope: KomeiAnimationScope, valid: () => boolean) => {
    if (typeof IntersectionObserver === "undefined") return
    const selector = homeRevealSelectors.join(",")
    const elements = document.querySelectorAll<HTMLElement>(selector)
    const history = (window as StartupWindow).komeiStartup?.homeViewport()
    const initial = new Set(elements)
    const attr = "data-komei-home-reveal"
    const pending = "data-komei-home-pending"
    const delay = "--komei-enter-delay"
    const threshold = 0.04
    const rails = new Map<HTMLElement, { x: number; y: number }>()
    const clear = (element: HTMLElement) => {
      element.removeAttribute(pending)
      element.removeAttribute(attr)
      element.style.removeProperty(delay)
    }

    const viewport = new IntersectionObserver(
      (entries) => {
        if (!valid() || reduceMotion.matches) return
        const batch = new Map<Element, number>()
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          if (homePresented.has(element)) continue
          const bounds = entry.boundingClientRect
          const rail = element.closest<HTMLElement>("[data-komei-post-timeline-scroll]")
          const entered = entry.isIntersecting && entry.intersectionRatio >= threshold
          const first = initial.delete(element)
          // Never dim or shift even a slice of a card the reader can already
          // see. Only wholly unseen items may take an offscreen starting pose.
          let staticEntry = first && entry.isIntersecting && entry.intersectionRatio > 0
          if (first && !staticEntry && history?.length && bounds.width && bounds.height) {
            // Vertical history doesn't imply that a horizontally clipped card
            // was seen; intersect both axes of its original, stationary frame.
            const clip = rail?.getBoundingClientRect()
            const width = Math.max(
              0,
              Math.min(bounds.right, window.innerWidth, clip?.right ?? Infinity) -
                Math.max(bounds.left, 0, clip?.left ?? 0),
            )
            const top = bounds.top + window.scrollY
            staticEntry =
              width > 0 &&
              history.some((range) => top < range.bottom && top + bounds.height > range.top)
          }
          if (!staticEntry && !entered) {
            if (first) element.setAttribute(pending, "")
            continue
          }
          homePresented.add(element)
          viewport.unobserve(element)
          if (staticEntry) continue

          // IO delivers targets in observation (DOM) order. A gap or another
          // kind of sibling starts a new group, even during a large scroll jump.
          const previous = element.previousElementSibling
          const sameKind =
            previous &&
            batch.has(previous) &&
            homeRevealSelectors.some((s) => element.matches(s) && previous.matches(s))
          const ms = sameKind ? Math.min(64, batch.get(previous)! + 32) : 0
          batch.set(element, ms)
          let side = ""
          if (rail) {
            const last = rails.get(rail)!
            const dy = window.scrollY - last.y
            // A vertical arrival at an already shifted rail is still vertical.
            if (
              rail.scrollLeft !== last.x &&
              bounds.bottom + dy > 0 &&
              bounds.top + dy < window.innerHeight
            )
              side = rail.scrollLeft > last.x ? "right" : "left"
          }
          element.removeAttribute(pending)
          element.style.setProperty(delay, `${ms}ms`)
          element.setAttribute(attr, side)
        }
        for (const [rail, last] of rails) {
          last.x = rail.scrollLeft
          last.y = window.scrollY
        }
      },
      { threshold },
    )
    elements.forEach((element) => {
      const rail = element.closest<HTMLElement>("[data-komei-post-timeline-scroll]")
      if (rail && !rails.has(rail)) rails.set(rail, { x: rail.scrollLeft, y: window.scrollY })
      if (element.contains(document.activeElement)) homePresented.add(element)
      if (!homePresented.has(element)) viewport.observe(element)
    })
    scope.observers.push(viewport)

    const finish = (event: AnimationEvent) => {
      if (!event.animationName.startsWith("komei-enter-") || !(event.target instanceof Element))
        return
      const owner = event.target.closest<HTMLElement>(`[${attr}]`)
      if (
        owner &&
        !owner
          .getAnimations({ subtree: true })
          .some(
            (a) =>
              a instanceof CSSAnimation &&
              a.animationName.startsWith("komei-enter-") &&
              a.playState !== "finished",
          )
      )
        clear(owner)
    }
    const focus = (event: FocusEvent) => {
      const element = event.target instanceof Element && event.target.closest<HTMLElement>(selector)
      if (!element) return
      homePresented.add(element)
      viewport.unobserve(element)
      clear(element)
    }
    document.addEventListener("animationend", finish)
    document.addEventListener("animationcancel", finish)
    document.addEventListener("focusin", focus)
    scope.cleanups.push(() => {
      document.removeEventListener("animationend", finish)
      document.removeEventListener("animationcancel", finish)
      document.removeEventListener("focusin", focus)
      elements.forEach(clear)
    })
  }

  const setupAnimations = async () => {
    const slug = document.body.dataset.slug ?? ""
    // prepare is synchronous in nav, before the GSAP await or the next paint.
    // micromorph commits synchronously; its awaited Promise only drains microtasks.
    const run = (window as StartupWindow).komeiStartup?.prepare(slug)
    if (!animationAllowed(slug) || reduceMotion.matches || (slug === "about/index" && !run))
      return run?.reveal()
    const container = document.querySelector("#quartz-root")
    if (!container) return run?.reveal()
    if (slug === "index" && homeRoute?.container === container) return

    const scope = createScope()
    const interactions = createScope()
    run?.onReveal(scope.cleanup)
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      run?.reveal()
      interactions.cleanup()
      if (homeRoute?.dispose === dispose) homeRoute = undefined
      document.removeEventListener("prenav", dispose)
      window.removeEventListener("pagehide", dispose)
      reduceMotion.removeEventListener("change", reduced)
    }
    const reduced = () => {
      if (reduceMotion.matches) dispose()
    }
    window.addCleanup(slug === "index" ? cleanupHome : dispose)
    // Home hash navigation may dispatch prenav without committing a new DOM.
    // The router's addCleanup runs on actual commits, not hash-only moves.
    if (slug !== "index") document.addEventListener("prenav", dispose)
    window.addEventListener("pagehide", dispose)
    reduceMotion.addEventListener("change", reduced)
    try {
      if (slug === "index") {
        homeRoute = { container, dispose }
        setupHomeReveals(
          interactions,
          () =>
            !disposed &&
            document.body.dataset.slug === "index" &&
            container === document.querySelector("#quartz-root"),
        )
      }

      if (reduceMotion.matches) return dispose()

      const gsap = await loadGsap()
      const currentSlug = document.body.dataset.slug ?? ""
      if (
        disposed ||
        currentSlug !== slug ||
        !animationAllowed(currentSlug) ||
        reduceMotion.matches
      )
        return dispose()
      // A script load event need not publish window.gsap (e.g. a stubbed or
      // empty response). Home IO does not depend on the music interaction layer.
      if (!gsap) return slug === "index" ? undefined : dispose()

      gsap.defaults({ duration: 0.55, ease: "power3.out", overwrite: "auto" })
      if (slug === "index") setupMusicInteractions(gsap, interactions)
      else if (run?.valid() && run.claim()) {
        setupAbout(gsap, scope, run)
        run.handoff()
      }
    } catch (error) {
      console.warn("GSAP 动效加载失败，已跳过非必要动画：", error)
      if (slug !== "index") dispose()
    }
  }

  document.addEventListener("nav", setupAnimations)
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && document.body.dataset.slug === "index") void setupAnimations()
  })
})()
