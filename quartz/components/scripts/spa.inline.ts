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

function responseIsOverHeavyBudget(response: Response): boolean {
  const contentLength = Number(response.headers.get("Content-Length") ?? 0)
  return Number.isFinite(contentLength) && contentLength > heavyRouteResponseBytes
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
const heavyRouteResponseBytes = 180_000
const routeShellCoverDuration = 220
const routeShellRevealDuration = 220
const heavyRouteRevealDuration = 560
let pageTransitionStarted = false
let pageTransitionTimer: number | undefined
let heavyRouteRevealTimer: number | undefined
let nextRouteIsHeavy = false
let routeShell: HTMLElement | undefined
let routeShellTimer: number | undefined

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

function markRoute(name: string) {
  performance.mark?.(`komei:${name}`)
}

function clearPageTransition() {
  window.clearTimeout(pageTransitionTimer)
  window.clearTimeout(heavyRouteRevealTimer)
  document.body.classList.remove(
    "komei-page-is-leaving",
    "komei-page-is-entering",
    "komei-heavy-route-is-entering",
  )
  pageTransitionStarted = false
}

function startPageTransition() {
  nextRouteIsHeavy = false
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
  if (!pageTransitionStarted || pageTransitionQuery.matches || nextRouteIsHeavy) {
    clearPageTransition()
    return
  }

  document.body.classList.remove("komei-page-is-leaving")
  document.body.classList.add("komei-page-is-entering")
  pageTransitionTimer = window.setTimeout(clearPageTransition, pageEnterDuration)
}

document.addEventListener("prenav", startPageTransition)
document.addEventListener("nav", finishPageTransition)

function ensureRouteShell() {
  if (routeShell?.isConnected) return routeShell

  const shell = document.createElement("div")
  shell.className = "komei-route-shell"
  shell.hidden = true
  shell.setAttribute("aria-live", "polite")
  shell.setAttribute("aria-atomic", "true")
  shell.innerHTML = `
    <div class="komei-route-shell__panel">
      <span class="komei-route-shell__label">正在准备内容</span>
      <span class="komei-route-shell__bar" aria-hidden="true"></span>
    </div>
  `
  document.body.append(shell)
  routeShell = shell
  return shell
}

async function showRouteShell(label = "正在准备内容") {
  const shell = ensureRouteShell()
  window.clearTimeout(routeShellTimer)
  shell.querySelector<HTMLElement>(".komei-route-shell__label")!.textContent = label
  shell.hidden = false
  shell.classList.remove("komei-route-shell--leaving")
  await nextFrame()
  shell.classList.add("komei-route-shell--active")
  if (pageTransitionQuery.matches) return
  await delay(routeShellCoverDuration)
}

async function hideRouteShell() {
  const shell = routeShell
  if (!shell || shell.hidden) return
  shell.classList.add("komei-route-shell--leaving")
  shell.classList.remove("komei-route-shell--active")
  if (pageTransitionQuery.matches) {
    shell.hidden = true
    shell.classList.remove("komei-route-shell--leaving")
    return
  }

  window.clearTimeout(routeShellTimer)
  await delay(routeShellRevealDuration)
  shell.hidden = true
  shell.classList.remove("komei-route-shell--leaving")
}

function resetRouteShell() {
  window.clearTimeout(routeShellTimer)
  const shell = routeShell
  if (!shell) return
  shell.hidden = true
  shell.classList.remove("komei-route-shell--active", "komei-route-shell--leaving")
}

function startHeavyRouteReveal() {
  if (pageTransitionQuery.matches) return
  window.clearTimeout(heavyRouteRevealTimer)
  document.body.classList.remove("komei-heavy-route-is-entering")
  window.requestAnimationFrame(() => {
    document.body.classList.add("komei-heavy-route-is-entering")
    heavyRouteRevealTimer = window.setTimeout(() => {
      document.body.classList.remove("komei-heavy-route-is-entering")
    }, heavyRouteRevealDuration)
  })
}

function startLoading() {
  if (document.querySelector(".navigation-progress")) return
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

function finishLoading() {
  document.querySelectorAll<HTMLElement>(".navigation-progress").forEach((loadingBar) => {
    loadingBar.style.width = "100%"
    window.setTimeout(() => loadingBar.remove(), 180)
  })
}

function patchHead(html: Document) {
  const elementsToRemove = document.head.querySelectorAll(":not([data-persist])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([data-persist])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))
}

async function commitHeavyRoute(html: Document, url: URL, isBack: boolean, title: string) {
  const currentRoot = document.querySelector<HTMLElement>("#quartz-root")
  const nextRoot = html.querySelector<HTMLElement>("#quartz-root")
  if (!currentRoot || !nextRoot) {
    await micromorph(document.body, html.body)
  } else {
    document.body.dataset.slug = html.body.dataset.slug
    document.body.className = html.body.className
    document.body.classList.add("komei-route-heavy-page")
    currentRoot.replaceWith(nextRoot)
  }

  patchHead(html)

  if (!isBack) {
    history.pushState({}, "", url)
  }

  if (announcer.textContent !== title) announcer.textContent = title
  announcer.dataset.persist = ""
  document.body.appendChild(announcer)

  if (!isBack) {
    if (url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
      el?.scrollIntoView({ block: "start" })
    } else {
      scrollToTop()
    }
  }

  notifyNav(getFullSlug(window))
  await nextFrame()
  await nextFrame()
  delete announcer.dataset.persist
}

async function useNativeNavigation(url: URL, isBack: boolean, shellPromise?: Promise<void>) {
  const ready = shellPromise ?? showRouteShell("正在打开页面")
  await ready
  if (isBack) {
    window.location.replace(url)
  } else {
    window.location.assign(url)
  }
}

let isNavigating = false
let p: DOMParser

function resetNavigationState() {
  isNavigating = false
  nextRouteIsHeavy = false
  clearPageTransition()
  resetRouteShell()
  document
    .querySelectorAll<HTMLElement>(".navigation-progress")
    .forEach((loadingBar) => loadingBar.remove())
}

async function _navigate(url: URL, isBack: boolean = false) {
  isNavigating = true
  markRoute("nav:start")
  const event: CustomEventMap["prenav"] = new CustomEvent("prenav", { detail: {} })
  document.dispatchEvent(event)
  startLoading()
  p = p || new DOMParser()
  let heavyShellPromise: Promise<void> | undefined
  const contents = await fetchCanonical(url, { maxBytes: heavyRouteResponseBytes })
    .then(async (res) => {
      markRoute("fetch:end")
      const contentType = res.headers.get("content-type")
      if (contentType?.startsWith("text/html")) {
        if (responseIsOverSpaBudget(res)) {
          clearPageTransition()
          heavyShellPromise = showRouteShell("正在打开页面")
          await useNativeNavigation(url, isBack, heavyShellPromise)
          return
        }

        const hintedHeavyRoute = responseIsOverHeavyBudget(res)
        if (hintedHeavyRoute) {
          nextRouteIsHeavy = true
          clearPageTransition()
          heavyShellPromise = showRouteShell()
        }

        markRoute("text:start")
        const text = await res.text()
        markRoute("text:end")
        if (shouldUseNativeNavigation(res, text)) {
          clearPageTransition()
          heavyShellPromise ??= showRouteShell("正在打开页面")
          await useNativeNavigation(url, isBack, heavyShellPromise)
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
  const isHeavyRoute = nextRouteIsHeavy || contents.length > heavyRouteResponseBytes
  if (isHeavyRoute) {
    nextRouteIsHeavy = true
    clearPageTransition()
    heavyShellPromise ??= showRouteShell()
    await heavyShellPromise
  }

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  markRoute("parse:start")
  const html = p.parseFromString(contents, "text/html")
  markRoute("parse:end")
  normalizeRelativeURLs(html, url)
  html.body.classList.toggle("komei-route-heavy-page", isHeavyRoute)

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

  if (isHeavyRoute) {
    markRoute("commit:start")
    await commitHeavyRoute(html, url, isBack, title)
    markRoute("commit:end")
    finishLoading()
    startHeavyRouteReveal()
    await nextFrame()
    await hideRouteShell()
    return
  }

  // morph body
  markRoute("commit:start")
  await micromorph(document.body, html.body)
  markRoute("commit:end")

  // now, patch head, re-executing scripts
  patchHead(html)

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({}, "", url)
  }

  notifyNav(getFullSlug(window))
  if (!isBack) {
    window.requestAnimationFrame(() => {
      if (url.hash) {
        const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
        el?.scrollIntoView({ block: "start" })
      } else {
        scrollToTop()
      }
    })
  }
  delete announcer.dataset.persist
  finishLoading()
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

    window.addEventListener("pagehide", () => {
      resetRouteShell()
    })

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) resetNavigationState()
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
