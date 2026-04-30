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

  const scrolledClass = "is-scrolled"
  const boundAttribute = "data-komei-home-nav-bound"
  const SCROLL_THRESHOLD = 32

  const setupHomepageHeader = () => {
    const header = document.querySelector(".komei-site-header")
    if (!(header instanceof HTMLElement)) return
    if (header.getAttribute(boundAttribute) === "true") return
    header.setAttribute(boundAttribute, "true")

    let frame = 0

    const update = () => {
      frame = 0
      const scrollY = window.scrollY || 0
      header.classList.toggle(scrolledClass, scrollY > SCROLL_THRESHOLD)
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    window.addEventListener("scroll", requestUpdate, { passive: true })
    update()

    window.addCleanup(() => {
      window.removeEventListener("scroll", requestUpdate)
      if (frame) window.cancelAnimationFrame(frame)
      header.classList.remove(scrolledClass)
      header.removeAttribute(boundAttribute)
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
