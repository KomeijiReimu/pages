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
    const historyPending = new Set(history?.length ? elements : [])
    const attr = "data-komei-home-reveal"

    const viewport = new IntersectionObserver((entries) => {
      if (!valid() || reduceMotion.matches) return
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        if (homePresented.has(element)) continue
        const bounds = entry.boundingClientRect
        const top = bounds.top + window.scrollY
        const bottom = bounds.bottom + window.scrollY
        // Head records vertical exposure before this observer attaches. A card
        // clipped off the side of its reading rail didn't share that exposure.
        const previouslyVisible =
          historyPending.delete(element) &&
          (entry.isIntersecting || (bounds.left < window.innerWidth && bounds.right > 0)) &&
          history?.some((range) => bottom > range.top && top < range.bottom)
        if (!previouslyVisible && !entry.isIntersecting) continue
        homePresented.add(element)
        viewport.unobserve(element)
        if (!previouslyVisible) element.setAttribute(attr, "")
      }
    })
    elements.forEach((element) => {
      if (!homePresented.has(element)) viewport.observe(element)
    })
    scope.observers.push(viewport)

    const finish = (event: AnimationEvent) => {
      if (event.animationName.startsWith("komei-enter-") && event.target instanceof Element)
        event.target.closest(`[${attr}]`)?.removeAttribute(attr)
    }
    const focus = (event: FocusEvent) => {
      const element = event.target instanceof Element && event.target.closest<HTMLElement>(selector)
      if (!element) return
      homePresented.add(element)
      viewport.unobserve(element)
      element.removeAttribute(attr)
    }
    document.addEventListener("animationend", finish)
    document.addEventListener("focusin", focus)
    scope.cleanups.push(() => {
      document.removeEventListener("animationend", finish)
      document.removeEventListener("focusin", focus)
      elements.forEach((element) => element.removeAttribute(attr))
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
      window.removeEventListener("pageshow", restore)
      reduceMotion.removeEventListener("change", reduced)
    }
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) dispose()
    }
    const reduced = () => {
      if (reduceMotion.matches) dispose()
    }
    window.addCleanup(dispose)
    document.addEventListener("prenav", dispose)
    window.addEventListener("pagehide", dispose)
    window.addEventListener("pageshow", restore)
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
        !gsap ||
        currentSlug !== slug ||
        !animationAllowed(currentSlug) ||
        reduceMotion.matches
      )
        return dispose()

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
})()
