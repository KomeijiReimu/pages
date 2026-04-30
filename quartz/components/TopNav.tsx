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
  const enterClass = "is-entering"
  const boundAttribute = "data-komei-home-nav-bound"
  const HYSTERESIS = 24

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

    let frame = 0
    let threshold = 0

    const measure = () => {
      slot.style.setProperty("--komei-header-slot-height", header.offsetHeight + "px")
      const rect = slot.getBoundingClientRect()
      threshold = Math.max(0, rect.top + window.scrollY)
    }

    const setFloating = (shouldFloat) => {
      const isFloating = header.classList.contains(floatingClass)
      if (isFloating === shouldFloat) return

      measure()
      slot.classList.toggle("is-active", shouldFloat)

      if (shouldFloat) {
        header.classList.add(enterClass)
        header.classList.add(floatingClass)
        void header.offsetHeight
        requestAnimationFrame(() => {
          header.classList.remove(enterClass)
        })
      } else {
        header.classList.remove(floatingClass)
        header.classList.remove(enterClass)
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
      header.classList.remove(floatingClass, scrolledClass, enterClass)
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
