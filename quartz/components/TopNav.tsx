import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { komeijireimuConfig } from "../komeijireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (slug === "404") return href
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

function isActiveRoute(slug: FullSlug, href: `/${string}`): boolean {
  if (href === "/") return slug === "index"

  const route = href.replace(/^\/+|\/+$/g, "")
  return slug === `${route}/index` || slug.startsWith(`${route}/`)
}

const homepageHeaderScript = `
(() => {
  const scriptFlag = "data-komei-home-nav-script-bound"
  if (document.documentElement.getAttribute(scriptFlag) === "true") return
  document.documentElement.setAttribute(scriptFlag, "true")

  const floatingClass = "is-floating"
  const scrolledClass = "is-scrolled"
  const boundAttribute = "data-komei-home-nav-bound"
  const RELEASE_SCROLL_Y = 4
  const FLOAT_DURATION = 420
  const FLOAT_EASING = "cubic-bezier(0.19, 1, 0.22, 1)"
  const SNAP_DISTANCE = 8

  const setupHomepageHeader = () => {
    const header = document.querySelector(".komei-site-header")
    if (document.body.dataset.slug !== "index" || !(header instanceof HTMLElement)) return
    if (header.getAttribute(boundAttribute) === "true") return
    header.setAttribute(boundAttribute, "true")

    const parent = header.parentElement
    if (!parent) {
      header.removeAttribute(boundAttribute)
      return
    }

    const slot = document.createElement("div")
    slot.className = "komei-site-header-slot"
    slot.setAttribute("aria-hidden", "true")
    parent.insertBefore(slot, header)

    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0
    let resizeFrame = 0
    let slotTransitionFrame = 0
    let navAnimation = null
    let motionToken = 0
    let phase = "rest"
    let threshold = 0

    const readScrollY = () => {
      const scrolling = document.scrollingElement || document.documentElement
      return scrolling.scrollTop
    }

    const clearSlotActivationOverride = () => {
      if (slotTransitionFrame) {
        window.cancelAnimationFrame(slotTransitionFrame)
        slotTransitionFrame = 0
      }

      slot.style.transition = ""
    }

    const activateSlotImmediately = () => {
      clearSlotActivationOverride()
      slot.style.transition = "none"
      slot.classList.add("is-active")
      slotTransitionFrame = window.requestAnimationFrame(() => {
        slotTransitionFrame = 0
        slot.style.transition = ""
      })
    }

    const deactivateSlotImmediately = () => {
      clearSlotActivationOverride()
      slot.style.transition = "none"
      slot.classList.remove("is-active")
      slotTransitionFrame = window.requestAnimationFrame(() => {
        slotTransitionFrame = 0
        slot.style.transition = ""
      })
    }

    const readTranslateY = () => {
      const transform = window.getComputedStyle(header).transform
      if (!transform || transform === "none") return 0

      try {
        return new DOMMatrixReadOnly(transform).m42
      } catch {
        return 0
      }
    }

    const applyFloatingMetrics = (rect) => {
      header.style.setProperty("--komei-header-float-left", rect.left + "px")
      header.style.setProperty("--komei-header-float-width", rect.width + "px")
    }

    const clearFloatingMetrics = () => {
      header.style.removeProperty("--komei-header-float-left")
      header.style.removeProperty("--komei-header-float-width")
      header.style.willChange = ""
    }

    const syncFloatingMetrics = () => {
      const source = slot.classList.contains("is-active") ? slot : header
      applyFloatingMetrics(source.getBoundingClientRect())
    }

    const clearNavMotion = () => {
      motionToken += 1
      if (navAnimation) {
        navAnimation.cancel()
        navAnimation = null
      }

      header.style.transform = ""
      header.style.opacity = ""
      header.style.willChange = ""
    }

    const playFlipY = (fromY, toY, onFinish) => {
      const token = ++motionToken
      if (navAnimation) {
        navAnimation.cancel()
        navAnimation = null
      }

      const settle = () => {
        if (token !== motionToken) return
        onFinish && onFinish()
        if (navAnimation) {
          navAnimation.cancel()
          navAnimation = null
        }
        header.style.transform = ""
        header.style.willChange = ""
      }

      if (reduceMotionQuery.matches || Math.abs(fromY - toY) < SNAP_DISTANCE) {
        settle()
        return
      }

      header.style.willChange = "transform"
      header.style.transform = "translate3d(0," + fromY + "px,0)"
      navAnimation = header.animate(
        [
          { transform: "translate3d(0," + fromY + "px,0)" },
          { transform: "translate3d(0," + toY + "px,0)" },
        ],
        {
          duration: FLOAT_DURATION,
          easing: FLOAT_EASING,
          fill: "forwards",
        },
      )

      const finishingAnimation = navAnimation
      finishingAnimation.finished
        .then(() => {
          if (token !== motionToken) return
          settle()
        })
        .catch(() => {
          if (token !== motionToken) return
          onFinish && onFinish()
          if (navAnimation === finishingAnimation) {
            navAnimation = null
          }
          header.style.transform = ""
          header.style.willChange = ""
        })
    }

    const measure = () => {
      slot.style.setProperty("--komei-header-slot-height", header.offsetHeight + "px")
      const rect = slot.getBoundingClientRect()
      threshold = Math.max(0, rect.top + readScrollY())
    }

    const releaseToFlow = () => {
      phase = "rest"
      header.classList.remove(floatingClass)
      clearFloatingMetrics()
      deactivateSlotImmediately()
    }

    const setFloating = (shouldFloat) => {
      if (shouldFloat) {
        if (phase === "floating" || phase === "enter") return

        if (phase === "leave") {
          phase = "enter"
          playFlipY(readTranslateY(), 0, () => {
            phase = "floating"
          })
          return
        }

        measure()
        const firstRect = header.getBoundingClientRect()
        applyFloatingMetrics(firstRect)
        activateSlotImmediately()
        header.classList.add(floatingClass)
        const lastRect = header.getBoundingClientRect()
        phase = "enter"
        playFlipY(firstRect.top - lastRect.top, 0, () => {
          phase = "floating"
        })
        return
      }

      if (phase === "rest" || phase === "leave") return

      const currentY = readTranslateY()
      const visualTop = header.getBoundingClientRect().top
      const slotTop = slot.getBoundingClientRect().top
      phase = "leave"
      playFlipY(currentY, currentY + (slotTop - visualTop), () => {
        releaseToFlow()
      })
    }

    const update = (fromResize) => {
      frame = 0
      resizeFrame = 0
      const scrollY = readScrollY()
      header.classList.toggle(scrolledClass, scrollY > 16)

      if (scrollY > threshold + 4) {
        setFloating(true)
      } else if (scrollY <= RELEASE_SCROLL_Y) {
        setFloating(false)
      } else {
        measure()
      }

      if (fromResize) {
        measure()
        if (phase === "floating" || phase === "enter") syncFloatingMetrics()
      }
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => update(false))
    }

    const requestResize = () => {
      if (resizeFrame) return
      resizeFrame = window.requestAnimationFrame(() => update(true))
    }

    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestResize, { passive: true })
    measure()
    requestUpdate()

    window.addCleanup(() => {
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestResize)
      if (frame) window.cancelAnimationFrame(frame)
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      clearSlotActivationOverride()
      clearNavMotion()
      header.classList.remove(floatingClass, scrolledClass)
      clearFloatingMetrics()
      header.removeAttribute(boundAttribute)
      slot.remove()
    })
  }

  document.addEventListener("nav", setupHomepageHeader)

  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  const mobileNavQuery = window.matchMedia("(max-width: 800px)")
  let activeTransitionTimer = 0
  let mobileNavFrame = 0
  let mobileNavLinks = null

  const clearActiveTransition = () => {
    if (activeTransitionTimer) {
      window.clearTimeout(activeTransitionTimer)
      activeTransitionTimer = 0
    }
    document.querySelectorAll(".komei-top-nav__links a.is-active-transition").forEach((link) => {
      link.classList.remove("is-active-transition")
    })
  }

  const updateMobileNavState = () => {
    mobileNavFrame = 0
    if (!(mobileNavLinks instanceof HTMLElement)) return
    const nav = mobileNavLinks.closest(".komei-top-nav")
    if (!(nav instanceof HTMLElement)) return

    const isScrollable = mobileNavLinks.scrollWidth > mobileNavLinks.clientWidth + 1
    const isAtStart = mobileNavLinks.scrollLeft <= 1
    const isAtEnd =
      mobileNavLinks.scrollLeft + mobileNavLinks.clientWidth >= mobileNavLinks.scrollWidth - 1

    nav.classList.toggle("is-scrollable", isScrollable)
    nav.classList.toggle("is-at-start", !isScrollable || isAtStart)
    nav.classList.toggle("is-at-end", !isScrollable || isAtEnd)
  }

  const requestMobileNavUpdate = () => {
    if (mobileNavFrame) return
    mobileNavFrame = window.requestAnimationFrame(updateMobileNavState)
  }

  const refreshMobileNav = (centerActive = false) => {
    if (mobileNavLinks instanceof HTMLElement) {
      mobileNavLinks.removeEventListener("scroll", requestMobileNavUpdate)
    }
    if (mobileNavFrame) window.cancelAnimationFrame(mobileNavFrame)
    mobileNavFrame = 0

    mobileNavLinks = document.querySelector(".komei-top-nav__links")
    if (!(mobileNavLinks instanceof HTMLElement)) return
    mobileNavLinks.addEventListener("scroll", requestMobileNavUpdate, { passive: true })

    mobileNavFrame = window.requestAnimationFrame(() => {
      mobileNavFrame = 0
      if (!(mobileNavLinks instanceof HTMLElement)) return

      if (centerActive && mobileNavQuery.matches) {
        const activeLink = mobileNavLinks.querySelector('a[aria-current="page"]')
        if (activeLink instanceof HTMLElement) {
          const containerRect = mobileNavLinks.getBoundingClientRect()
          const activeRect = activeLink.getBoundingClientRect()
          const maxScrollLeft = Math.max(0, mobileNavLinks.scrollWidth - mobileNavLinks.clientWidth)
          const activeCenter =
            mobileNavLinks.scrollLeft + activeRect.left - containerRect.left + activeRect.width / 2
          const centeredScrollLeft = activeCenter - mobileNavLinks.clientWidth / 2
          const targetScrollLeft = Math.min(maxScrollLeft, Math.max(0, centeredScrollLeft))

          mobileNavLinks.scrollTo({
            left: targetScrollLeft,
            behavior: reduceMotionQuery.matches ? "auto" : "smooth",
          })
        }
      }

      updateMobileNavState()
    })
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const link = target.closest(".komei-top-nav__links a")
    if (!(link instanceof HTMLAnchorElement)) return

    const isExternal = link.hostname !== window.location.hostname
    const isModifier = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
    const isNewWindow = link.target === "_blank"
    const isCurrentPage =
      link.pathname === window.location.pathname && link.search === window.location.search

    if (isExternal || isModifier || isNewWindow || isCurrentPage) return

    clearActiveTransition()
    document.querySelectorAll(".komei-top-nav__links a.is-navigating").forEach((item) => {
      item.classList.remove("is-navigating")
    })
    link.classList.add("is-navigating")
    document.documentElement.classList.add("is-route-pending")
  })

  document.addEventListener("nav", () => {
    document.documentElement.classList.remove("is-route-pending")
    document.querySelectorAll(".komei-top-nav__links a.is-navigating").forEach((link) => {
      link.classList.remove("is-navigating")
    })

    clearActiveTransition()
    const activeLink = document.querySelector('.komei-top-nav__links a[aria-current="page"]')
    if (activeLink && !reduceMotionQuery.matches) {
      activeLink.classList.add("is-active-transition")
      activeTransitionTimer = window.setTimeout(clearActiveTransition, 240)
    }
    refreshMobileNav(true)
  })

  window.addEventListener("resize", requestMobileNavUpdate, { passive: true })
  window.addEventListener("pageshow", () => refreshMobileNav(false))
  window.addEventListener("pagehide", () => {
    clearActiveTransition()
    document.documentElement.classList.remove("is-route-pending")
    if (mobileNavFrame) window.cancelAnimationFrame(mobileNavFrame)
    mobileNavFrame = 0
    if (mobileNavLinks instanceof HTMLElement) {
      mobileNavLinks.removeEventListener("scroll", requestMobileNavUpdate)
    }
    mobileNavLinks = null
  })
})()
`

const TopNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const homeHref = slug === "404" ? "/" : pathToRoot(slug)

  return (
    <div class="komei-site-header">
      <a
        class="komei-site-header__brand"
        href={homeHref}
        aria-label={`返回 ${komeijireimuConfig.site.name} 首页`}
      >
        <span class="komei-site-header__logo" aria-hidden="true">
          {komeijireimuConfig.site.logo?.kind === "image" && komeijireimuConfig.site.logo.src ? (
            <img
              src={komeijireimuConfig.site.logo.src}
              alt={komeijireimuConfig.site.logo.alt ?? ""}
            />
          ) : komeijireimuConfig.site.logo?.kind === "text" ? (
            <span class="komei-site-header__logo-text">{komeijireimuConfig.site.logo.text}</span>
          ) : (
            <>
              <span class="komei-site-header__logo-sky" />
              <span class="komei-site-header__logo-cloud" />
              <span class="komei-site-header__logo-star" />
            </>
          )}
        </span>
        <span class="komei-site-header__title">{komeijireimuConfig.site.name}</span>
        <span class="komei-site-header__subtitle">{komeijireimuConfig.site.subtitle}</span>
      </a>
      <nav class="komei-top-nav" aria-label={`${komeijireimuConfig.site.name} 主导航`}>
        <div class="komei-top-nav__links">
          {komeijireimuConfig.navLinks.map((link) => {
            const isActive = isActiveRoute(slug, link.href)

            return (
              <a
                href={routeHref(slug, link.href)}
                title={link.description}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </a>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

TopNav.afterDOMLoaded = homepageHeaderScript

export default (() => TopNav) satisfies QuartzComponentConstructor
