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

const stickyHeaderScript = `
(() => {
  const scriptFlag = "data-komei-nav-script-bound"
  if (document.documentElement.getAttribute(scriptFlag) === "true") return
  document.documentElement.setAttribute(scriptFlag, "true")

  const detachedClass = "is-detached"
  const boundAttribute = "data-komei-nav-bound"
  const DETACH_SCROLL_Y = 56
  const ATTACH_SCROLL_Y = 40

  const isArticleSlug = (slug) =>
    (slug.startsWith("posts/") || slug.startsWith("notes/")) && !slug.endsWith("/index")

  const setupStickyHeader = () => {
    const header = document.querySelector(".komei-site-header")
    if (!(header instanceof HTMLElement)) return

    if (isArticleSlug(document.body?.dataset.slug ?? "")) {
      header.classList.remove(detachedClass)
      return
    }

    if (header.getAttribute(boundAttribute) === "true") return
    header.setAttribute(boundAttribute, "true")

    let frame = 0
    let detached = header.classList.contains(detachedClass)

    const readScrollY = () => {
      const scrolling = document.scrollingElement || document.documentElement
      return scrolling.scrollTop || window.scrollY || 0
    }

    const update = () => {
      frame = 0
      const scrollY = readScrollY()
      if (detached) {
        if (scrollY <= ATTACH_SCROLL_Y) detached = false
      } else if (scrollY >= DETACH_SCROLL_Y) {
        detached = true
      }
      header.classList.toggle(detachedClass, detached)
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
      header.classList.remove(detachedClass)
      header.removeAttribute(boundAttribute)
    })
  }

  document.addEventListener("nav", setupStickyHeader)

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

TopNav.afterDOMLoaded = stickyHeaderScript

export default (() => TopNav) satisfies QuartzComponentConstructor
