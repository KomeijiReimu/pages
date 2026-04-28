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
  const slotActiveClass = "is-active"
  const boundAttribute = "data-komei-home-nav-bound"

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
    let observer = null

    const measure = () => {
      slot.style.setProperty("--komei-header-slot-height", header.offsetHeight + "px")
    }

    const setFloating = (shouldFloat) => {
      measure()
      header.classList.toggle(floatingClass, shouldFloat)
      slot.classList.toggle(slotActiveClass, shouldFloat)
    }

    const updateFromSlot = () => {
      frame = 0
      setFloating(slot.getBoundingClientRect().top < 0)
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateFromSlot)
    }

    const cleanupFns = []

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0]
        if (!entry) return

        setFloating(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      })
      observer.observe(sentinel)
      cleanupFns.push(() => observer?.disconnect())
    } else {
      window.addEventListener("scroll", requestUpdate, { passive: true })
      cleanupFns.push(() => window.removeEventListener("scroll", requestUpdate))
    }

    window.addEventListener("resize", requestUpdate)
    cleanupFns.push(() => window.removeEventListener("resize", requestUpdate))

    measure()
    requestUpdate()

    window.addCleanup(() => {
      cleanupFns.forEach((cleanup) => cleanup())
      if (frame) window.cancelAnimationFrame(frame)
      header.classList.remove(floatingClass)
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
