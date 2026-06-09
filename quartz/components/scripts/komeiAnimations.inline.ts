;(() => {
  type KomeiGsapAnimation = { kill?: () => void }
  type KomeiGsap = {
    defaults: (vars: Record<string, unknown>) => void
    set: (targets: unknown, vars: Record<string, unknown>) => void
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
      script.onerror = reject
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
    selector: string,
    options: BatchOptions = {},
  ) => {
    const elements = Array.from(document.querySelectorAll(selector)).filter(
      (element) => element instanceof HTMLElement,
    )

    if (elements.length === 0) return
    if (reduceMotion.matches) {
      gsap.set(elements, { autoAlpha: 1, clearProps: "transform,opacity,visibility" })
      return
    }

    gsap.set(elements, { autoAlpha: 0, y: options.y ?? 26 })
    scope.cleanups.push(setAnimatedLayer(gsap, elements))

    const observer = new IntersectionObserver(
      (entries) => {
        const entered = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target)
          .filter((element) => element instanceof HTMLElement)

        if (entered.length === 0) return

        entered.forEach((element) => observer.unobserve(element))
        const tween = gsap.to(entered, {
          autoAlpha: 1,
          y: 0,
          duration: options.duration ?? 0.62,
          ease: options.ease ?? "power3.out",
          stagger: options.stagger ?? 0.08,
          overwrite: "auto",
          clearProps: "transform,opacity,visibility,willChange",
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

  const setupHome = (gsap: KomeiGsap, scope: KomeiAnimationScope) => {
    const hero = document.querySelector(".komei-home-hero")
    if (hero && !reduceMotion.matches) {
      const heroItems = [
        ".komei-home-hero__eyebrow",
        ".komei-home-hero h1",
        ".komei-home-hero__copy > p",
        ".komei-home-hero__actions > *",
        ".komei-profile-card",
      ]
        .flatMap((selector) => Array.from(hero.querySelectorAll(selector)))
        .filter((element) => element instanceof HTMLElement)

      scope.cleanups.push(setAnimatedLayer(gsap, heroItems))
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } })
      timeline
        .fromTo(
          heroItems,
          { autoAlpha: 0, y: 24, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.72,
            stagger: 0.07,
            clearProps: "transform,opacity,visibility,willChange",
          },
        )
        .fromTo(
          ".komei-home-hero__backdrop",
          { scale: 1.035, autoAlpha: 0.72 },
          {
            scale: 1,
            autoAlpha: 1,
            duration: 1.2,
            ease: "sine.out",
            clearProps: "transform,opacity,visibility",
          },
          0,
        )
      scope.timelines.push(timeline)
    }

    animateBatchOnEnter(
      gsap,
      scope,
      [
        ".komei-section-heading",
        ".komei-post-card",
        ".komei-category-card",
        ".komei-tag-cloud",
        ".komei-module-card",
        ".komei-home-gallery__seasons-panel",
        ".komei-home-gallery__postcard",
        ".komei-home-gallery-masonry__shell",
      ].join(","),
      { y: 28, stagger: 0.06 },
    )

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
        scope.timelines.push(tween)
      }
      scope.addListener(playButton, "click", handleClick)

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
            scope.timelines.push(tween)
          }
        } else if (player.classList.contains("is-error")) {
          const tween = gsap.fromTo(
            player,
            { x: -3 },
            { x: 0, duration: 0.34, ease: "elastic.out(1, 0.45)", clearProps: "transform" },
          )
          scope.timelines.push(tween)
        }
      }

      const observer = new MutationObserver(statePulse)
      observer.observe(player, { attributes: true, attributeFilter: ["class"] })
      scope.mutationObservers.push(observer)
    })
  }

  const setupAbout = (gsap: KomeiGsap, scope: KomeiAnimationScope) => {
    animateBatchOnEnter(
      gsap,
      scope,
      'body[data-slug="about/index"] .center > article > *, body[data-slug="about/index"] footer',
      { y: 22, stagger: 0.05, rootMargin: "0px 0px -8% 0px" },
    )
  }

  const setupAnimations = async () => {
    const slug = document.body.dataset.slug ?? ""
    if (!animationAllowed(slug)) return

    const scope = createScope()
    let disposed = false
    window.addCleanup(() => {
      disposed = true
      scope.cleanup()
    })

    if (reduceMotion.matches) return

    try {
      const gsap = await loadGsap()
      const currentSlug = document.body.dataset.slug ?? ""
      if (disposed || !gsap || currentSlug !== slug || !animationAllowed(currentSlug)) return

      gsap.defaults({ duration: 0.55, ease: "power3.out", overwrite: "auto" })
      if (slug === "index") setupHome(gsap, scope)
      if (slug === "about/index") setupAbout(gsap, scope)
    } catch (error) {
      console.warn("GSAP 动效加载失败，已跳过非必要动画：", error)
      scope.cleanup()
    }
  }

  document.addEventListener("nav", setupAnimations)
})()
