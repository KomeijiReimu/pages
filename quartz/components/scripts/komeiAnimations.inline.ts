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
    timeline: (vars?: Record<string, unknown>) => {
      fromTo: (
        targets: unknown,
        fromVars: Record<string, unknown>,
        toVars: Record<string, unknown>,
        position?: string | number,
      ) => ReturnType<KomeiGsap["timeline"]>
      kill: () => void
      play: () => ReturnType<KomeiGsap["timeline"]>
    }
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

  const setupHome = (
    gsap: KomeiGsap,
    scope: KomeiAnimationScope,
    interactions: KomeiAnimationScope,
    run: StartupRun | undefined,
  ) => {
    const initial = (elements: HTMLElement[], vars: Record<string, unknown>, transform: string) => {
      scope.timelines.push(gsap.set(elements, { ...vars, lazy: false }))
      // A paused global clock can queue even a lazy:false setter. The finite
      // startup gate may be handed off only after real inline initials exist.
      for (const element of elements) {
        if (element.style.opacity === "0") continue
        element.style.opacity = "0"
        element.style.visibility = "hidden"
        element.style.transform = transform
      }
    }
    const hero = document.querySelector(".komei-home-hero")
    if (hero && run && !reduceMotion.matches) {
      const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } })
      scope.timelines.push(timeline)
      const backdrop = hero.querySelector(".komei-home-hero__backdrop")
      const hasBackdrop = backdrop instanceof HTMLElement && run.targets.includes(backdrop)
      if (hasBackdrop) {
        // Image decoding is deliberately not a startup dependency. A late or
        // failed image leaves the stable Hero base readable, without replay.
        scope.cleanups.push(setAnimatedLayer(gsap, [backdrop]))
        initial([backdrop], { autoAlpha: 0, scale: 1.02 }, "scale(1.02)")
        timeline.fromTo(
          backdrop,
          { autoAlpha: 0, scale: 1.02 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.72,
            ease: "sine.out",
            clearProps: "transform,opacity,visibility,willChange",
            onComplete: () => run.complete([backdrop]),
            immediateRender: false,
          },
          0,
        )
      }
      const heroItems = [
        ".komei-home-hero__eyebrow",
        ".komei-home-hero h1",
        ".komei-home-hero__actions > *",
        ".komei-profile-card",
      ]
        .flatMap((selector) => Array.from(hero.querySelectorAll(selector)))
        .filter((element) => element instanceof HTMLElement && run.targets.includes(element))

      if (heroItems.length > 0) {
        scope.cleanups.push(setAnimatedLayer(gsap, heroItems))
        // Timeline fromTo can defer its first render. Install the hidden state
        // synchronously BEFORE releasing the CSS gate, even on a warm cache.
        initial(
          heroItems as HTMLElement[],
          { autoAlpha: 0, y: 24, scale: 0.985 },
          "translateY(24px) scale(0.985)",
        )
        timeline.fromTo(
          heroItems,
          { autoAlpha: 0, y: 24, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.72,
            stagger: 0.07,
            clearProps: "transform,opacity,visibility,willChange",
            onComplete: () => run.complete(heroItems),
            immediateRender: false,
          },
          hasBackdrop ? 0.1 : 0,
        )
      }
      run.handoff(() => timeline.play())
    }

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

  const setupHomeReveals = (
    scope: KomeiAnimationScope,
    getReadyGsap: () => KomeiGsap | undefined,
    valid: () => boolean,
  ) => {
    if (typeof IntersectionObserver === "undefined") return
    const startup = (window as StartupWindow).komeiStartup
    const isOpen = () => startup?.homeOpen() ?? true
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(homeRevealSelectors.join(",")),
    )
    // This is history from BEFORE this route took ownership, not a live range
    // including the viewport that is only now opening behind the foreground.
    const history = startup?.homeViewport()
    const firstExposure = new Set(isOpen() ? [] : elements)
    let openedAt: number | undefined
    const nearby = new Set<HTMLElement>()
    const active = new Map<
      HTMLElement,
      {
        setter?: KomeiGsapAnimation
        tween?: KomeiGsapAnimation
        restore: () => void
      }
    >()
    const finish = (element: HTMLElement) => {
      const item = active.get(element)
      item?.setter?.kill?.()
      item?.tween?.kill?.()
      item?.restore()
      active.delete(element)
      nearby.delete(element)
      firstExposure.delete(element)
      homePresented.add(element)
      viewport.unobserve(element)
      preparation.unobserve(element)
    }
    const prepare = (element: HTMLElement, gsap: KomeiGsap) => {
      const item = {
        restore: setAnimatedLayer(gsap, [element]),
        setter: undefined as KomeiGsapAnimation | undefined,
        tween: undefined as KomeiGsapAnimation | undefined,
      }
      active.set(element, item)
      preparation.unobserve(element)
      nearby.delete(element)
      try {
        item.setter = gsap.set(element, { opacity: 0.7, y: 28, lazy: false })
        scope.timelines.push(item.setter)
      } catch {
        finish(element)
      }
    }
    // This observer uses the real viewport, not the smaller animation root.
    // Anything already exposed without a prepared state stays statically readable.
    const viewport = new IntersectionObserver(
      (entries) => {
        if (!valid() || reduceMotion.matches || !isOpen()) return
        let index = 0
        for (const entry of entries) {
          if (openedAt !== undefined && entry.time < openedAt) continue
          const element = entry.target
          if (!(element instanceof HTMLElement)) continue
          if (homePresented.has(element)) {
            viewport.unobserve(element)
            continue
          }
          // Offscreen is not seen: a later first entry may skip the preparation band.
          if (!entry.isIntersecting) continue
          let item = active.get(element)
          if (item?.tween) continue // Duplicate records cannot replace the owner.
          const gsap = getReadyGsap()
          if (!item && gsap && firstExposure.has(element)) {
            // The first native record can arrive only AFTER gone/noteViewport.
            // A card peeking 17px was covered, not previously presented. Claim
            // its original y28/.62 owner in this callback, before consuming it.
            prepare(element, gsap)
            item = active.get(element)
          }
          firstExposure.delete(element)
          if (!item || !gsap) {
            finish(element)
            continue
          }
          // The finite tween owns completion. Its own y28 or a small reverse
          // scroll must not feed back into an IO-exit kill on the next frame.
          viewport.unobserve(element)
          preparation.unobserve(element)
          item.setter?.kill?.()
          try {
            item.tween = gsap.to(element, {
              opacity: 1,
              y: 0,
              duration: 0.62,
              delay: index++ * 0.06,
              ease: "power3.out",
              overwrite: "auto",
              onComplete: () => finish(element),
            })
            scope.timelines.push(item.tween)
          } catch {
            finish(element)
          }
        }
      },
      { threshold: 0 },
    )
    scope.observers.push(viewport)
    const preparation = new IntersectionObserver(
      (entries) => {
        if (!valid() || reduceMotion.matches) return
        for (const entry of entries) {
          if (isOpen() && openedAt !== undefined && entry.time < openedAt) continue
          const element = entry.target
          if (!(element instanceof HTMLElement)) continue
          if (homePresented.has(element)) {
            preparation.unobserve(element)
            continue
          }
          if (active.has(element)) continue
          if (!entry.isIntersecting) {
            nearby.delete(element)
            continue
          }
          const bounds = entry.boundingClientRect
          const exposed = bounds.top < window.innerHeight && bounds.bottom > 0
          const top = bounds.top + window.scrollY
          const bottom = bounds.bottom + window.scrollY
          if (
            (isOpen() && exposed && !firstExposure.has(element)) ||
            history?.some((range) => bottom > range.top && top < range.bottom)
          ) {
            finish(element)
            continue
          }
          // Prepare only just below the viewport, from native supplied geometry.
          // Opacity remains readable; missing IO/library never installs this state.
          if (
            bounds.top < window.innerHeight &&
            (!exposed || (isOpen() && !firstExposure.has(element)))
          )
            continue
          nearby.add(element)
          const gsap = getReadyGsap()
          if (gsap) prepare(element, gsap)
          else if (isOpen() && exposed) finish(element)
        }
      },
      { rootMargin: "0px 0px 160px 0px", threshold: 0 },
    )
    scope.observers.push(preparation)
    scope.cleanups.push(() => {
      active.forEach((item, element) => {
        item.restore()
        homePresented.add(element)
      })
      active.clear()
      nearby.clear()
      firstExposure.clear()
    })
    elements.forEach((element) => {
      if (!homePresented.has(element)) {
        viewport.observe(element)
        preparation.observe(element)
      }
    })
    const focus = (event: FocusEvent) => {
      for (const element of elements) {
        if (element.contains(event.target as Node)) {
          finish(element)
          break
        }
      }
    }
    document.addEventListener("focusin", focus)
    scope.cleanups.push(() => document.removeEventListener("focusin", focus))
    const refresh = () => {
      if (!valid()) return
      for (const element of elements) {
        if (homePresented.has(element)) continue
        // Native records, not layout reads, decide exposure after the explicit
        // foreground-open signal. Covered first-screen cards retain their owner.
        viewport.unobserve(element)
        viewport.observe(element)
        preparation.unobserve(element)
        preparation.observe(element)
      }
    }
    if (startup)
      scope.cleanups.push(
        startup.onHomeOpen(() => {
          openedAt = window.performance.now()
          refresh()
        }),
      )
    // A late library may find a card still in the preparation band. Re-request
    // native records rather than trusting stale geometry or reading layout.
    return () => {
      for (const element of nearby) {
        if (!homePresented.has(element) && !active.has(element)) {
          preparation.unobserve(element)
          preparation.observe(element)
        }
      }
    }
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
    let readyGsap: KomeiGsap | undefined
    let refreshReveals: (() => void) | undefined
    try {
      if (slug === "index") {
        homeRoute = { container, dispose }
        refreshReveals = setupHomeReveals(
          interactions,
          () => readyGsap,
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

      readyGsap = gsap
      gsap.defaults({ duration: 0.55, ease: "power3.out", overwrite: "auto" })
      refreshReveals?.()
      const claimed = run?.valid() && run.claim()
      if (slug === "index") setupHome(gsap, scope, interactions, claimed ? run : undefined)
      if (slug === "about/index" && claimed && run) setupAbout(gsap, scope, run)
      if (claimed && slug === "about/index") run?.handoff()
    } catch (error) {
      console.warn("GSAP 动效加载失败，已跳过非必要动画：", error)
      dispose()
    }
  }

  document.addEventListener("nav", setupAnimations)
})()
