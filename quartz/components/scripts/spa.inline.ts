import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"

// adapted from `micromorph`
// https://github.com/natemoo-re/micromorph
const NODE_TYPE_ELEMENT = 1
let announcer = document.createElement("route-announcer")
const isElement = (target: EventTarget | null): target is Element =>
  (target as Node)?.nodeType === NODE_TYPE_ELEMENT
const isLocalUrl = (href: string) => {
  try {
    const url = new URL(href)
    if (window.location.origin === url.origin) {
      return true
    }
  } catch {
    return false
  }
  return false
}

const isSamePage = (url: URL): boolean => {
  const sameOrigin = url.origin === window.location.origin
  const samePath = url.pathname === window.location.pathname
  return sameOrigin && samePath
}

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual"
}

const scrollToTop = () => window.scrollTo({ top: 0, behavior: "auto" })
const maxSpaResponseBytes = 260_000

function responseIsOverSpaBudget(response: Response): boolean {
  const contentLength = Number(response.headers.get("Content-Length") ?? 0)
  return Number.isFinite(contentLength) && contentLength > maxSpaResponseBytes
}

function shouldUseNativeNavigation(response: Response, contents: string): boolean {
  return responseIsOverSpaBudget(response) || contents.length > maxSpaResponseBytes
}

const forceInitialHomeTop = () => {
  if (window.location.hash || document.body.dataset.slug !== "index") return
  scrollToTop()
  window.requestAnimationFrame(() => {
    scrollToTop()
    window.setTimeout(scrollToTop, 80)
  })
}

const getOpts = ({ target }: Event): { url: URL; scroll?: boolean } | undefined => {
  if (!isElement(target)) return
  if (target.attributes.getNamedItem("target")?.value === "_blank") return
  const a = target.closest("a")
  if (!a) return
  if ("routerIgnore" in a.dataset) return
  const { href } = a
  if (!isLocalUrl(href)) return
  return { url: new URL(href), scroll: "routerNoscroll" in a.dataset ? false : undefined }
}

function notifyNav(url: FullSlug) {
  const event: CustomEventMap["nav"] = new CustomEvent("nav", { detail: { url } })
  document.dispatchEvent(event)
}

const cleanupFns: Set<(...args: any[]) => void> = new Set()
window.addCleanup = (fn) => cleanupFns.add(fn)

const pageTransitionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
const pageEnterDuration = 720
let pageTransitionStarted = false
let pageTransitionTimer: number | undefined

function clearPageTransition() {
  window.clearTimeout(pageTransitionTimer)
  document.body.classList.remove("komei-page-is-leaving", "komei-page-is-entering")
  pageTransitionStarted = false
}

function startPageTransition() {
  if (pageTransitionQuery.matches) {
    clearPageTransition()
    return
  }

  window.clearTimeout(pageTransitionTimer)
  pageTransitionStarted = true
  document.body.classList.remove("komei-page-is-entering")
  document.body.classList.add("komei-page-is-leaving")
}

function finishPageTransition() {
  if (!pageTransitionStarted || pageTransitionQuery.matches) {
    clearPageTransition()
    return
  }

  document.body.classList.remove("komei-page-is-leaving")
  document.body.classList.add("komei-page-is-entering")
  pageTransitionTimer = window.setTimeout(clearPageTransition, pageEnterDuration)
}

document.addEventListener("prenav", startPageTransition)
document.addEventListener("nav", finishPageTransition)

function startLoading() {
  const loadingBar = document.createElement("div")
  loadingBar.className = "navigation-progress"
  loadingBar.style.width = "0"
  if (!document.body.contains(loadingBar)) {
    document.body.appendChild(loadingBar)
  }

  setTimeout(() => {
    loadingBar.style.width = "80%"
  }, 100)
}

let isNavigating = false
let p: DOMParser
async function _navigate(url: URL, isBack: boolean = false) {
  isNavigating = true
  const event: CustomEventMap["prenav"] = new CustomEvent("prenav", { detail: {} })
  document.dispatchEvent(event)
  startLoading()
  p = p || new DOMParser()
  const contents = await fetchCanonical(url, { maxBytes: maxSpaResponseBytes })
    .then(async (res) => {
      const contentType = res.headers.get("content-type")
      if (contentType?.startsWith("text/html")) {
        if (responseIsOverSpaBudget(res)) {
          window.location.assign(url)
          return
        }

        const text = await res.text()
        if (shouldUseNativeNavigation(res, text)) {
          window.location.assign(url)
          return
        }

        return text
      } else {
        window.location.assign(url)
      }
    })
    .catch(() => {
      window.location.assign(url)
    })

  if (!contents) return

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  const html = p.parseFromString(contents, "text/html")
  normalizeRelativeURLs(html, url)

  let title = html.querySelector("title")?.textContent
  if (title) {
    document.title = title
  } else {
    const h1 = document.querySelector("h1")
    title = h1?.innerText ?? h1?.textContent ?? url.pathname
  }
  if (announcer.textContent !== title) {
    announcer.textContent = title
  }
  announcer.dataset.persist = ""
  html.body.appendChild(announcer)

  // morph body
  await micromorph(document.body, html.body)

  // scroll into place and add history
  if (!isBack) {
    if (url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
      el?.scrollIntoView()
    } else {
      scrollToTop()
    }
  }

  // now, patch head, re-executing scripts
  const elementsToRemove = document.head.querySelectorAll(":not([data-persist])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([data-persist])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({}, "", url)
  }

  notifyNav(getFullSlug(window))
  if (!isBack && !url.hash) {
    window.requestAnimationFrame(scrollToTop)
  }
  delete announcer.dataset.persist
}

async function navigate(url: URL, isBack: boolean = false) {
  if (isNavigating) return
  isNavigating = true
  try {
    await _navigate(url, isBack)
  } catch (e) {
    console.error(e)
    window.location.assign(url)
  } finally {
    isNavigating = false
  }
}

window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (!url || event.ctrlKey || event.metaKey) return
      event.preventDefault()

      if (isSamePage(url) && url.hash) {
        const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
        el?.scrollIntoView()
        history.pushState({}, "", url)
        return
      }

      navigate(url, false)
    })

    window.addEventListener("popstate", (event) => {
      const { url } = getOpts(event) ?? {}
      if (window.location.hash && window.location.pathname === url?.pathname) return
      navigate(new URL(window.location.toString()), true)
      return
    })
  }

  return new (class Router {
    go(pathname: RelativeURL) {
      const url = new URL(pathname, window.location.toString())
      return navigate(url, false)
    }

    back() {
      return window.history.back()
    }

    forward() {
      return window.history.forward()
    }
  })()
}

createRouter()
notifyNav(getFullSlug(window))
forceInitialHomeTop()

if (!customElements.get("route-announcer")) {
  const attrs = {
    "aria-live": "assertive",
    "aria-atomic": "true",
    style:
      "position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px",
  }

  customElements.define(
    "route-announcer",
    class RouteAnnouncer extends HTMLElement {
      constructor() {
        super()
      }
      connectedCallback() {
        for (const [key, value] of Object.entries(attrs)) {
          this.setAttribute(key, value)
        }
      }
    },
  )
}
