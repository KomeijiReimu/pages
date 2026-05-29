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

  const setupNavAnimation = () => {
    const scriptFlag = "data-komei-nav-animation-bound"
    if (document.documentElement.getAttribute(scriptFlag) === "true") {
      // 每次导航后为当前页链接添加进入动画
      const activeLink = document.querySelector('.komei-top-nav__links a[aria-current="page"]')
      if (activeLink) {
        activeLink.classList.add("is-active-transition")
        setTimeout(() => activeLink.classList.remove("is-active-transition"), 300)
      }
      return
    }
    document.documentElement.setAttribute(scriptFlag, "true")

    // 使用事件委托，全局只绑定一次
    document.addEventListener("click", (e) => {
      const target = e.target
      if (!(target instanceof Element)) return

      const link = target.closest(".komei-top-nav__links a")
      if (!(link instanceof HTMLAnchorElement)) return

      const isExternal = link.hostname !== window.location.hostname
      const isModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
      const isNewWindow = link.target === "_blank"
      const isCurrentPage = link.pathname === window.location.pathname && link.search === window.location.search

      // 外链、修饰键、新窗口、当前页不触发 pending 动画
      if (isExternal || isModifier || isNewWindow || isCurrentPage) return

      // 清理旧状态
      document.querySelectorAll(".komei-top-nav__links a").forEach((l) => {
        l.classList.remove("is-navigating", "is-active-transition")
      })

      // 标记正在导航
      link.classList.add("is-navigating")
      document.documentElement.classList.add("is-route-pending")
    })

    // 导航完成后清理状态
    document.addEventListener("nav", () => {
      document.documentElement.classList.remove("is-route-pending")
      document.querySelectorAll(".komei-top-nav__links a").forEach((l) => {
        l.classList.remove("is-navigating")
      })

      const activeLink = document.querySelector('.komei-top-nav__links a[aria-current="page"]')
      if (activeLink) {
        activeLink.classList.add("is-active-transition")
        setTimeout(() => activeLink.classList.remove("is-active-transition"), 300)
      }
    })
  }

  document.addEventListener("nav", setupNavAnimation)
})()
`

const TopNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const homeHref = pathToRoot(slug)

  return (
    <div class="komei-site-header">
      <a
        class="komei-site-header__brand"
        href={homeHref}
        aria-label={`返回 ${komeireimuConfig.site.name} 首页`}
      >
        <span class="komei-site-header__logo" aria-hidden="true">
          {komeireimuConfig.site.logo?.kind === "image" && komeireimuConfig.site.logo.src ? (
            <img src={komeireimuConfig.site.logo.src} alt={komeireimuConfig.site.logo.alt ?? ""} />
          ) : komeireimuConfig.site.logo?.kind === "text" ? (
            <span class="komei-site-header__logo-text">{komeireimuConfig.site.logo.text}</span>
          ) : (
            <>
              <span class="komei-site-header__logo-sky" />
              <span class="komei-site-header__logo-cloud" />
              <span class="komei-site-header__logo-star" />
            </>
          )}
        </span>
        <span class="komei-site-header__title">{komeireimuConfig.site.name}</span>
        <span class="komei-site-header__subtitle">{komeireimuConfig.site.subtitle}</span>
      </a>
      <nav class="komei-top-nav" aria-label={`${komeireimuConfig.site.name} 主导航`}>
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
