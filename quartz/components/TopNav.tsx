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
  const switchingClass = "is-switching"
  const slotActiveClass = "is-active"
  const boundAttribute = "data-komei-home-nav-bound"
  const HYSTERESIS = 28

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

    const sentinel = document.createElement("span")
    sentinel.className = "komei-site-header-sentinel"
    slot.appendChild(sentinel)
    parent.insertBefore(slot, header)

    let frame = 0
    let threshold = 0
    let isFirstUpdate = true
    let activeAnimation = null

    const prefersReducedMotion = () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    const measure = () => {
      slot.style.setProperty("--komei-header-slot-height", header.offsetHeight + "px")
      const rect = slot.getBoundingClientRect()
      threshold = Math.max(0, rect.top + window.scrollY)
    }

    const cancelActiveAnimation = () => {
      activeAnimation?.cancel()
      activeAnimation = null
      header.getAnimations?.().forEach((animation) => animation.cancel())
    }

    const setFloating = (shouldFloat, animate = true) => {
      const isFloating = header.classList.contains(floatingClass)
      if (isFloating === shouldFloat) {
        measure()
        slot.classList.toggle(slotActiveClass, shouldFloat)
        return
      }

      cancelActiveAnimation()
      const firstRect = header.getBoundingClientRect()
      measure()
      header.classList.add(switchingClass)
      header.classList.toggle(floatingClass, shouldFloat)
      slot.classList.toggle(slotActiveClass, shouldFloat)

      const lastRect = header.getBoundingClientRect()
      const deltaY = firstRect.top - lastRect.top
      const travelY = Math.abs(deltaY) > 0.5 ? deltaY : shouldFloat ? -16 : 16
      const fromTransform = shouldFloat
        ? "translate3d(-50%, " + travelY + "px, 0) scale(0.986)"
        : "translate3d(0, " + travelY + "px, 0) scale(0.994)"
      const toTransform = shouldFloat
        ? "translate3d(-50%, 0, 0) scale(1)"
        : "translate3d(0, 0, 0) scale(1)"

      if (!animate || prefersReducedMotion() || typeof header.animate !== "function") {
        header.classList.remove(switchingClass)
        return
      }

      activeAnimation = header.animate(
        [
          {
            opacity: shouldFloat ? 0.72 : 0.94,
            transform: fromTransform,
          },
          {
            opacity: 1,
            transform: toTransform,
          },
        ],
        {
          duration: shouldFloat ? 440 : 380,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      )

      activeAnimation.addEventListener(
        "cancel",
        () => {
          header.classList.remove(switchingClass)
        },
        { once: true },
      )

      activeAnimation.addEventListener(
        "finish",
        () => {
          activeAnimation = null
          header.classList.remove(switchingClass)
        },
        { once: true },
      )
    }

    const update = () => {
      frame = 0
      const scrollY = window.scrollY || 0
      const isFloating = header.classList.contains(floatingClass)

      if (!isFloating && scrollY > threshold + 4) {
        setFloating(true, !isFirstUpdate)
      } else if (isFloating && scrollY <= Math.max(0, threshold - HYSTERESIS)) {
        setFloating(false, !isFirstUpdate)
      } else {
        measure()
      }

      isFirstUpdate = false
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    const cleanupFns = []

    window.addEventListener("scroll", requestUpdate, { passive: true })
    cleanupFns.push(() => window.removeEventListener("scroll", requestUpdate))
    window.addEventListener("resize", requestUpdate, { passive: true })
    cleanupFns.push(() => window.removeEventListener("resize", requestUpdate))

    measure()
    requestUpdate()

    window.addCleanup(() => {
      cleanupFns.forEach((cleanup) => cleanup())
      cancelActiveAnimation()
      if (frame) window.cancelAnimationFrame(frame)
      header.classList.remove(floatingClass)
      header.classList.remove(switchingClass)
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
