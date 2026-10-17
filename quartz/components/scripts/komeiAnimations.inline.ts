import type { StartupRun, StartupWindow } from "../../util/komeiStartup"
;(() => {
  type KomeiGsapAnimation = { kill?: () => void }
  type KomeiGsap = {
    defaults: (vars: Record<string, unknown>) => void
    set: (targets: unknown, vars: Record<string, unknown>) => void
    killTweensOf: (targets: unknown) => void
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
    }
  }

  const getGsap = () => (window as Window & { gsap?: KomeiGsap }).gsap
  const rootFlag = "data-komei-gsap-script-bound"
  if (document.documentElement.getAttribute(rootFlag) === "true") return
  document.documentElement.setAttribute(rootFlag, "true")

  const GSAP_SRC = "/static/vendor/gsap.min.js"
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let gsapLoading: Promise<KomeiGsap | undefined> | undefined

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
      timelines.forEach((timeline) => timeline?.kill?.())
      observers.forEach((observer) => observer.disconnect())
      mutationObservers.forEach((observer) => observer.disconnect())
      listeners.forEach((remove) => remove())
      cleanups.forEach((fn) => fn())
    }

    return { cleanups, timelines, observers, mutationObservers, addListener, cleanup }
  }

  const setAnimatedLayer = (gsap: KomeiGsap, elements: Element[]) => {
    elements.forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      element.style.willChange = "transform, opacity"
    })
    return () => gsap.set(elements, { clearProps: "willChange,transform,opacity,visibility" })
  }

  type KomeiAnimationScope = ReturnType<typeof createScope>
  const homePresented = new WeakSet<HTMLElement>()

  // Unlike startup targets these nodes are readable at rest, including when
  // IntersectionObserver is unavailable. No page-wide hidden waiting state.
  const setupHomeReveals = (
    gsap: KomeiGsap,
    scope: KomeiAnimationScope,
    startupTargets: HTMLElement[],
    valid: () => boolean,
  ) => {
    if (!("IntersectionObserver" in window)) return
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          ".komei-home-hero__eyebrow",
          ".komei-home-hero h1",
          ".komei-profile-card__identity",
          ".komei-profile-card__motto",
          ".komei-profile-card__facts",
          ".komei-section-heading",
          ".komei-post-card",
          ".komei-category-card",
          ".komei-tag-cloud",
          ".komei-module-card",
          ".komei-home-gallery__seasons-panel",
          ".komei-home-gallery-masonry__shell",
        ].join(","),
      ),
    ).filter(
      (element) =>
        !startupTargets.includes(element) &&
        !homePresented.has(element) &&
        !element.querySelector(".komei-music-player"),
    )
    // Keep the seasons panel (including its postcard) as one semantic surface.
    const elements = candidates.filter(
      (element) => !candidates.some((parent) => parent !== element && parent.contains(element)),
    )
    const active = new Map<HTMLElement, KomeiGsapAnimation>()
    const clear = (element: HTMLElement) => {
      active.get(element)?.kill?.()
      active.delete(element)
      gsap.set(element, { clearProps: "transform,opacity,visibility,willChange" })
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!valid() || reduceMotion.matches) return
        const entered = entries
          .filter(
            (entry) => entry.isIntersecting && !homePresented.has(entry.target as HTMLElement),
          )
          .map((entry) => entry.target as HTMLElement)
        const mobile = window.matchMedia("(max-width: 800px)").matches
        entered.forEach((element, index) => {
          // One delivery may contain multiple entries for the same target.
          if (homePresented.has(element)) return
          homePresented.add(element)
          if (element.contains(document.activeElement)) {
            observer.unobserve(element)
            return
          }
          try {
            const tween = gsap.fromTo(
              element,
              { opacity: 0.7, y: mobile ? 8 : 12 },
              {
                opacity: 1,
                y: 0,
                duration: mobile ? 0.95 : 1.1,
                delay: mobile ? 0 : Math.min(index * 0.1, 0.3),
                ease: "power2.out",
                immediateRender: false,
                clearProps: "transform,opacity,visibility,willChange",
                onComplete: () => {
                  active.delete(element)
                  observer.unobserve(element)
                },
              },
            )
            active.set(element, tween)
          } catch {
            clear(element)
            observer.unobserve(element)
          }
        })
        // Fast scrolling must not leave an in-flight reveal dimmed offscreen.
        entries
          .filter((entry) => !entry.isIntersecting)
          .forEach((entry) => {
            const element = entry.target as HTMLElement
            if (active.has(element)) {
              clear(element)
              observer.unobserve(element)
            }
          })
      },
      { rootMargin: "0px", threshold: 0.01 },
    )
    elements.forEach((element) => observer.observe(element))
    scope.observers.push(observer)
    const focus = (event: FocusEvent) => {
      const target = event.target
      elements
        .filter((element) => target instanceof Node && element.contains(target))
        .forEach((element) => {
          observer.unobserve(element)
          homePresented.add(element)
          clear(element)
        })
    }
    document.addEventListener("focusin", focus)
    scope.cleanups.push(() => {
      document.removeEventListener("focusin", focus)
      elements.forEach((element) => {
        if (active.has(element)) clear(element)
      })
    })
  }
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
      gsap.set(elements, { autoAlpha: 1, clearProps: "transform,opacity,visibility" })
      return
    }

    gsap.set(elements, { autoAlpha: 0, y: options.y ?? 26, lazy: false })
    scope.cleanups.push(setAnimatedLayer(gsap, elements))

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
    run: StartupRun,
    pageValid: () => boolean,
  ) => {
    const hero = document.querySelector(".komei-home-hero")
    if (hero && !reduceMotion.matches) {
      const mobile = window.matchMedia("(max-width: 800px)").matches
      const lightMotion =
        mobile || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
      const backdrop = hero.querySelector(".komei-home-hero__backdrop")
      const hasBackdrop = backdrop instanceof HTMLElement && run.targets.includes(backdrop)
      if (hasBackdrop) {
        // Image decoding is deliberately not a startup dependency. A late or
        // failed image leaves the stable Hero base readable, without replay.
        const opacity = Number.parseFloat(
          getComputedStyle(backdrop).getPropertyValue("--komei-hero-bg-opacity"),
        )
        scope.cleanups.push(setAnimatedLayer(gsap, [backdrop]))
        gsap.set(backdrop, { autoAlpha: 0, scale: lightMotion ? 1 : 1.02, lazy: false })
        scope.timelines.push(
          gsap.to(backdrop, {
            autoAlpha: Number.isFinite(opacity) ? opacity : 1,
            scale: 1,
            duration: 2.8,
            ease: "sine.out",
            clearProps: "transform,opacity,visibility,willChange",
            onComplete: () => run.complete([backdrop]),
          }),
        )
      }
      const groups = [
        { selector: ".komei-home-hero__eyebrow", start: 0.1, duration: 1.25 },
        { selector: ".komei-home-hero h1", start: 0.35, duration: 2.45 },
        { selector: ".komei-profile-card__identity", start: 0.75, duration: 1.6 },
        { selector: ".komei-profile-card__motto", start: 1.25, duration: 1.6 },
        { selector: ".komei-profile-card__facts", start: 1.55, duration: 1.6 },
      ]
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } })
      scope.timelines.push(timeline)
      for (const group of groups) {
        const elements = Array.from(hero.querySelectorAll<HTMLElement>(group.selector)).filter(
          (element) => run.targets.includes(element),
        )
        if (elements.length === 0) continue
        elements.forEach((element) => homePresented.add(element))
        scope.cleanups.push(setAnimatedLayer(gsap, elements))
        gsap.set(elements, { autoAlpha: 0, y: lightMotion ? 8 : 16, lazy: false })
        timeline.fromTo(
          elements,
          { autoAlpha: 0, y: lightMotion ? 8 : 16 },
          {
            autoAlpha: 1,
            y: 0,
            duration: group.duration,
            clearProps: "transform,opacity,visibility,willChange",
            onComplete: () => run.complete(elements),
            immediateRender: false,
          },
          group.start,
        )
        const focus = () => {
          gsap.killTweensOf(elements)
          run.complete(elements)
        }
        elements.forEach((element) => scope.addListener(element, "focusin", focus))
      }
    }

    setupHomeReveals(gsap, interactions, run.targets, pageValid)

    const musicPlayers = Array.from(document.querySelectorAll(".komei-music-player"))
    musicPlayers.forEach((player) => {
      const playButton = player.querySelector("[data-komei-music-play]")
      if (!(playButton instanceof HTMLButtonElement)) return

      const handleClick = () => {
        if (reduceMotion.matches || !pageValid()) return
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

  const setupAnimations = async () => {
    const slug = document.body.dataset.slug ?? ""
    // prepare is synchronous in nav, before the GSAP await or the next paint.
    // micromorph commits synchronously; its awaited Promise only drains microtasks.
    const run = (window as StartupWindow).komeiStartup?.prepare(slug)
    if (!animationAllowed(slug) || !run) return

    const scope = createScope()
    const interactions = createScope()
    run.onReveal(scope.cleanup)
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      run.reveal()
      interactions.cleanup()
    }
    window.addCleanup(dispose)
    if (slug === "index") {
      const restored = (event: PageTransitionEvent) => {
        if (event.persisted) dispose()
      }
      const reduced = () => {
        if (reduceMotion.matches) dispose()
      }
      document.addEventListener("prenav", dispose)
      window.addEventListener("pagehide", dispose)
      window.addEventListener("pageshow", restored)
      reduceMotion.addEventListener("change", reduced)
      interactions.cleanups.push(() => {
        document.removeEventListener("prenav", dispose)
        window.removeEventListener("pagehide", dispose)
        window.removeEventListener("pageshow", restored)
        reduceMotion.removeEventListener("change", reduced)
      })
    }

    if (reduceMotion.matches) return run.reveal()

    try {
      const gsap = await loadGsap()
      const currentSlug = document.body.dataset.slug ?? ""
      if (
        disposed ||
        !gsap ||
        currentSlug !== slug ||
        !animationAllowed(currentSlug) ||
        reduceMotion.matches ||
        !run.valid() ||
        !run.claim()
      )
        return run.reveal()

      gsap.defaults({ duration: 0.55, ease: "power3.out", overwrite: "auto" })
      if (slug === "index") {
        const container = document.querySelector("#quartz-root")
        setupHome(
          gsap,
          scope,
          interactions,
          run,
          () =>
            !disposed &&
            document.body.dataset.slug === "index" &&
            container?.isConnected === true &&
            container === document.querySelector("#quartz-root"),
        )
      }
      if (slug === "about/index") setupAbout(gsap, scope, run)
      run.handoff()
    } catch (error) {
      console.warn("GSAP 动效加载失败，已跳过非必要动画：", error)
      run.reveal()
      interactions.cleanup()
    }
  }

  document.addEventListener("nav", setupAnimations)
})()
