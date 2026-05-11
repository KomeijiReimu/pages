import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
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
  const HYSTERESIS = 24
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
        clearSlotActivationOverride()
        clearNavMotion()
        slot.classList.remove("is-active")
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
      } else if (isFloating && scrollY <= Math.max(0, threshold - HYSTERESIS)) {
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
})()
`

const TopNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const homeHref = pathToRoot(slug)

  return (
    <div class="komei-site-header">
      <a class="komei-site-header__brand" href={homeHref} aria-label="返回 KomeiReimu 首页">
        <span class="komei-site-header__logo" aria-hidden="true">
          <span class="komei-site-header__logo-sky" />
          <span class="komei-site-header__logo-cloud" />
          <span class="komei-site-header__logo-star" />
        </span>
        <span class="komei-site-header__title">{komeireimuConfig.site.name}</span>
        <span class="komei-site-header__subtitle">{komeireimuConfig.site.subtitle}</span>
      </a>
      <nav class="komei-top-nav" aria-label="KomeiReimu 主导航">
        <div class="komei-top-nav__links">
          {komeireimuConfig.navLinks.map((link) => {
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
