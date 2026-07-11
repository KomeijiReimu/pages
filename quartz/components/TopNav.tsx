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
  const FLOAT_DURATION = 190
  const FLOAT_EASING = "cubic-bezier(0.2, 0, 0, 1)"

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
    let slotTransitionFrame = 0
    let navAnimation = null
    let threshold = 0

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

    const clearNavMotion = () => {
      if (navAnimation) {
        navAnimation.cancel()
        navAnimation = null
      }

      header.style.transform = ""
      header.style.opacity = ""
    }

    const clearCompletedMotion = (finishingAnimation) => {
      if (navAnimation !== finishingAnimation) return

      navAnimation = null
      finishingAnimation.cancel()
      header.style.transform = ""
      header.style.opacity = ""
    }

    const playFloatMotion = (fromRect) => {
      if (reduceMotionQuery.matches) return

      const floatingRect = header.getBoundingClientRect()
      const floatOffset = fromRect.top - floatingRect.top
      if (Math.abs(floatOffset) < 1) return

      navAnimation = header.animate(
        [
          { opacity: 0.96, transform: "translateY(" + floatOffset + "px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: FLOAT_DURATION,
          easing: FLOAT_EASING,
          fill: "both",
        },
      )

      const finishingAnimation = navAnimation
      finishingAnimation.finished
        .then(() => clearCompletedMotion(finishingAnimation))
        .catch(() => {
          if (navAnimation !== finishingAnimation) return
          navAnimation = null
          header.style.transform = ""
          header.style.opacity = ""
        })
    }

    const measure = () => {
      slot.style.setProperty("--komei-header-slot-height", header.offsetHeight + "px")
      const rect = slot.getBoundingClientRect()
      threshold = Math.max(0, rect.top + window.scrollY)
    }

    const setFloating = (shouldFloat) => {
      const isFloating = header.classList.contains(floatingClass)

      if (isFloating === shouldFloat) return

      if (shouldFloat) {
        measure()
        const headerRect = header.getBoundingClientRect()
        clearNavMotion()
        activateSlotImmediately()
        header.classList.add(floatingClass)
        playFloatMotion(headerRect)
      } else {
        clearNavMotion()
        deactivateSlotImmediately()
        header.classList.remove(floatingClass)
      }
    }

    const update = () => {
      frame = 0
      const scrollY = window.scrollY || 0
      header.classList.toggle(scrolledClass, scrollY > 16)

      const isFloating = header.classList.contains(floatingClass)
      if (!isFloating && scrollY > threshold + 4) {
        setFloating(true)
      } else if (isFloating && scrollY <= RELEASE_SCROLL_Y) {
        setFloating(false)
      } else {
        measure()
      }
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestUpdate, { passive: true })
    measure()
    requestUpdate()

    window.addCleanup(() => {
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestUpdate)
      if (frame) window.cancelAnimationFrame(frame)
      clearSlotActivationOverride()
      clearNavMotion()
      header.classList.remove(floatingClass, scrolledClass)
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
