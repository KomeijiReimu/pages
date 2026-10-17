import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"
import { ScrollHistory, type ScrollEntry } from "./scrollHistory"

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

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual"
}

const scrollHistory = new ScrollHistory(window)
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
let renderedHistoryKey = window.location.pathname + window.location.search

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

async function showRouteShell(label = "正在准备内容", valid = () => true) {
  const shell = ensureRouteShell()
  window.clearTimeout(routeShellTimer)
  shell.querySelector<HTMLElement>(".komei-route-shell__label")!.textContent = label
  shell.hidden = false
  shell.classList.remove("komei-route-shell--leaving")
  await nextFrame()
  if (!valid()) return
  shell.classList.add("komei-route-shell--active")
  if (pageTransitionQuery.matches) return
  await delay(routeShellCoverDuration)
}

async function hideRouteShell(valid = () => true) {
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
  if (!valid()) return
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

function startHeavyRouteReveal(valid = () => true) {
  if (pageTransitionQuery.matches) return
  window.clearTimeout(heavyRouteRevealTimer)
  document.body.classList.remove("komei-heavy-route-is-entering")
  window.requestAnimationFrame(() => {
    if (!valid()) return
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

async function commitHeavyRoute(html: Document) {
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
}

async function useNativeNavigation(url: URL, isBack: boolean, valid: () => boolean) {
  if (!valid()) return
  clearPageTransition()
  await showRouteShell("正在打开页面", valid)
  if (!valid()) return
  scrollHistory.capture()
  if (isBack) {
    if (window.location.href === url.href) {
      window.location.reload()
    } else {
      window.location.replace(url)
    }
  } else {
    window.location.assign(url)
  }
}

let navigationId = 0
let controller: AbortController | undefined
let commitQueue = Promise.resolve()
let committing = false
let p: DOMParser

function resetNavigationState() {
  nextRouteIsHeavy = false
  clearPageTransition()
  resetRouteShell()
  document
    .querySelectorAll<HTMLElement>(".navigation-progress")
    .forEach((loadingBar) => loadingBar.remove())
}

function historyKey(url: URL): string {
  return url.pathname + url.search
}

function finishRoute(url: URL, target: ScrollEntry | undefined, valid: () => boolean) {
  const e = target ?? scrollHistory.push(url)
  scrollHistory.activate(e)
  renderedHistoryKey = historyKey(url)
  notifyNav(getFullSlug(window))
  if (!valid()) return
  scrollHistory.restore(url, target?.position)
  delete announcer.dataset.persist
  finishLoading()
}

async function navigate(url: URL, isBack: boolean = false) {
  const id = ++navigationId
  controller?.abort()
  const abort = new AbortController()
  controller = abort
  const valid = () => id === navigationId
  scrollHistory.cancelRestore()
  resetNavigationState()
  // Synchronously release any fixed-body drawer before taking the source snapshot.
  // On popstate capture() persists by rendered ID, not the already-selected target.
  const event: CustomEventMap["prenav"] = new CustomEvent("prenav", { detail: {} })
  document.dispatchEvent(event)
  if (!valid()) return
  scrollHistory.capture()
  const target = isBack ? scrollHistory.current() : undefined

  if (!committing && historyKey(url) === renderedHistoryKey && (isBack || url.hash)) {
    resetNavigationState()
    const e = target ?? scrollHistory.push(url)
    scrollHistory.activate(e)
    scrollHistory.restore(url, target?.position)
    return
  }

  markRoute("nav:start")
  startLoading()
  p = p || new DOMParser()
  try {
    const res = await fetchCanonical(url, {
      maxBytes: heavyRouteResponseBytes,
      signal: abort.signal,
    })
    if (!valid()) return
    markRoute("fetch:end")
    if (!res.headers.get("content-type")?.startsWith("text/html") || responseIsOverSpaBudget(res)) {
      await useNativeNavigation(url, isBack, valid)
      return
    }
    markRoute("text:start")
    const contents = await res.text()
    if (!valid()) return
    markRoute("text:end")
    if (shouldUseNativeNavigation(res, contents)) {
      await useNativeNavigation(url, isBack, valid)
      return
    }
    const heavy = responseIsOverHeavyBudget(res) || contents.length > heavyRouteResponseBytes
    if (heavy) {
      nextRouteIsHeavy = true
      clearPageTransition()
      await showRouteShell("正在准备内容", valid)
      if (!valid()) return
    }

    // Fetches may overlap, DOM morphs may not. Check ownership both before and
    // after micromorph's asynchronous boundary, including before native fallback.
    const commit = commitQueue.then(async () => {
      if (!valid()) return
      committing = true
      try {
        scrollHistory.capture()
        scrollHistory.suspend()
        renderedHistoryKey = ""
        cleanupFns.forEach((fn) => fn())
        cleanupFns.clear()
        if (!valid()) return
        markRoute("parse:start")
        const html = p.parseFromString(contents, "text/html")
        markRoute("parse:end")
        normalizeRelativeURLs(html, url)
        html.body.classList.toggle("komei-route-heavy-page", heavy)
        const title = html.querySelector("title")?.textContent ?? url.pathname
        announcer.dataset.persist = ""
        html.body.appendChild(announcer)
        markRoute("commit:start")
        if (heavy) await commitHeavyRoute(html)
        else await micromorph(document.body, html.body)
        if (!valid()) return
        markRoute("commit:end")
        document.title = title
        announcer.textContent = title
        document.body.appendChild(announcer)
        patchHead(html)
        if (!valid()) return
        finishRoute(url, target, valid)
        if (!valid()) return
        if (heavy) {
          startHeavyRouteReveal(valid)
          await nextFrame()
          if (valid()) await hideRouteShell(valid)
        }
      } finally {
        committing = false
      }
    })
    commitQueue = commit.catch(() => {})
    await commit
  } catch (e) {
    if (!valid()) return
    console.error(e)
    await useNativeNavigation(url, isBack, valid)
  }
}

window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (
        !url ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      navigate(url, false)
    })

    window.addEventListener("popstate", () => {
      const url = new URL(window.location.toString())
      handledHashUrl = url.href
      void navigate(url, true)
    })

    window.addEventListener("hashchange", () => {
      if (handledHashUrl === window.location.href) return
      handledHashUrl = window.location.href
      void navigate(new URL(window.location.href), true)
    })

    window.addEventListener("pagehide", () => {
      ++navigationId
      controller?.abort()
      scrollHistory.cancelRestore()
      scrollHistory.capture()
      resetNavigationState()
    })

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        ++navigationId
        controller?.abort()
        scrollHistory.cancelRestore()
        resetNavigationState()
        scrollHistory.activate(scrollHistory.current())
        // The preserved document already owns its viewport, including hash pages.
        // Do not replay initial anchor/top positioning on bfcache restore.
      }
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

let handledHashUrl = window.location.href
createRouter()
notifyNav(getFullSlug(window))
const initialEntry = scrollHistory.current()
if (initialEntry.position || window.location.hash)
  scrollHistory.restore(new URL(window.location.href), initialEntry.position)

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
