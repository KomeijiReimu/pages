export type ScrollPosition = { x: number; y: number }
export type ScrollEntry = { id: string; url: string; position?: ScrollPosition }
export type RouteCommit = {
  source: "initial" | "link" | "history" | "navigate"
  from?: string
  position?: ScrollPosition // saved destination, never the outgoing viewport
}

const namespace = "__quartzScroll"
const storageKey = "quartz-scroll-history-v1"
const limit = 80

function position(value: unknown): value is ScrollPosition {
  if (!value || typeof value !== "object") return false
  const p = value as ScrollPosition
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0
}

function entry(value: unknown): value is ScrollEntry {
  if (!value || typeof value !== "object") return false
  const e = value as ScrollEntry
  return (
    typeof e.id === "string" &&
    typeof e.url === "string" &&
    (e.position === undefined || position(e.position))
  )
}

export function savedScrollEntry(win: Window): ScrollEntry | undefined {
  const candidate: unknown = win.history.state?.[namespace]
  if (entry(candidate) && candidate.url === win.location.href) return candidate
}

export function scrollDestination(win: Window, url: URL, saved?: ScrollPosition): ScrollPosition {
  if (saved) return saved
  let id = url.hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    /* Keep malformed hashes literal. */
  }
  const el = id ? win.document.getElementById(id) : null
  return { x: 0, y: el ? el.getBoundingClientRect().top + win.scrollY : 0 }
}

function watchScrollInput(win: Window, stop: () => void, signal: AbortSignal) {
  const options = { passive: true, capture: true, signal }
  win.addEventListener("wheel", stop, options)
  win.addEventListener("touchstart", stop, options)
  win.addEventListener(
    "pointerdown",
    (event) => {
      const root = win.document.documentElement
      if (event.clientX >= root.clientWidth || event.clientY >= root.clientHeight) stop()
    },
    options,
  )
  win.addEventListener(
    "keydown",
    (event) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) &&
        !(
          event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable]")
        )
      )
        stop()
    },
    options,
  )
}

declare global {
  interface Window {
    takeInitialScrollIntent?: () => boolean
  }
}

// The classic head script runs before the deferred router. Only entries that
// could need a restore need to remember input during this gap.
export function watchInitialScroll(win: Window) {
  const saved = savedScrollEntry(win)
  const url = new URL(win.location.href)
  if (!saved && !url.hash) return
  const listeners = new AbortController()
  let readerMoved = false
  const stop = () => {
    readerMoved = true
    listeners.abort()
  }
  watchScrollInput(win, stop, listeners.signal)
  const noteMovement = () => {
    if (!win.scrollY && !win.scrollX) return
    // An initial native anchor jump or a native restoration is not a drag.
    const root = win.document.documentElement
    const at = (p: ScrollPosition) =>
      Math.abs(win.scrollY - Math.min(p.y, root.scrollHeight - root.clientHeight)) <= 1 &&
      Math.abs(win.scrollX - Math.min(p.x, root.scrollWidth - root.clientWidth)) <= 1
    if (saved?.position && at(saved.position)) return
    if (url.hash) {
      const target = win.document.querySelector(":target")
      if (target) {
        const p = scrollDestination(win, url)
        if (at(p)) return
        const padding = parseFloat(win.getComputedStyle(root).scrollPaddingTop) || 0
        const margin = parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0
        if (at({ ...p, y: Math.max(0, p.y - padding - margin) })) return
      }
    }
    stop()
  }
  win.addEventListener("scroll", noteMovement, { passive: true, signal: listeners.signal })
  win.takeInitialScrollIntent = () => {
    if (!readerMoved) noteMovement() // scroll event may still be queued
    listeners.abort()
    delete win.takeInitialScrollIntent
    return readerMoved
  }
}

// A rendered document can still be the source after popstate has selected the
// destination entry. Never replace that destination's state with source scroll.
export class ScrollHistory {
  private positions = new Map<string, ScrollPosition>()
  private rendered: ScrollEntry
  private scrollTimer?: number
  private stopRestore?: () => void
  private active = true

  private readPositions(): Map<string, ScrollPosition> | undefined {
    try {
      const saved: unknown = JSON.parse(this.win.sessionStorage.getItem(storageKey) ?? "[]")
      if (Array.isArray(saved)) {
        const positions = new Map<string, ScrollPosition>()
        for (const pair of saved.slice(-limit)) {
          if (Array.isArray(pair) && typeof pair[0] === "string" && position(pair[1]))
            positions.set(pair[0], pair[1])
        }
        return positions
      }
    } catch {
      /* Storage is optional (privacy mode, quota, malformed data). */
    }
  }

  constructor(private win: Window) {
    this.positions = this.readPositions() ?? this.positions
    this.rendered = this.current()
    win.addEventListener(
      "scroll",
      () => {
        if (this.stopRestore || this.scrollTimer !== undefined) return
        this.scrollTimer = win.setTimeout(() => {
          this.scrollTimer = undefined
          if (!this.stopRestore && this.matchesRendered()) this.capture()
        }, 100)
      },
      { passive: true },
    )
  }

  private state(): Record<string, unknown> {
    const state: unknown = this.win.history.state
    return state && typeof state === "object" ? (state as Record<string, unknown>) : {}
  }

  private persist(id: string, saved: ScrollPosition) {
    // Other documents (including bfcache entries) share this store. Re-read it
    // and update only this capture, never publish this document's stale table.
    const latest = this.readPositions()
    this.positions = latest ?? this.positions
    this.positions.delete(id)
    this.positions.set(id, saved)
    while (this.positions.size > limit) this.positions.delete(this.positions.keys().next().value!)
    if (!latest) return // A failed read must not turn into a stale whole-table write.
    try {
      this.win.sessionStorage.setItem(storageKey, JSON.stringify([...this.positions]))
    } catch {
      /* In-memory and history.state remain usable. */
    }
  }

  private replace(e: ScrollEntry) {
    this.win.history.replaceState({ ...this.state(), [namespace]: e }, "")
  }

  current(): ScrollEntry {
    const candidate = savedScrollEntry(this.win)
    const e: ScrollEntry = candidate
      ? { ...candidate }
      : { id: globalThis.crypto.randomUUID(), url: this.win.location.href }
    e.position = this.positions.get(e.id) ?? e.position
    this.replace(e)
    return e
  }

  matchesRendered() {
    const current = this.state()[namespace]
    return (
      entry(current) &&
      current.id === this.rendered.id &&
      this.win.location.href === this.rendered.url
    )
  }

  capture() {
    if (!this.active) return
    // The drawer supplies the real position while body is fixed at scrollY=0.
    const detail: ScrollPosition = { x: this.win.scrollX, y: this.win.scrollY }
    this.win.document.dispatchEvent(new CustomEvent("quartz:scroll-capture", { detail }))
    this.rendered.position = detail
    if (this.matchesRendered()) this.replace(this.rendered)
    this.persist(this.rendered.id, detail)
  }

  push(url: URL): ScrollEntry {
    const e = { id: globalThis.crypto.randomUUID(), url: url.href }
    this.win.history.pushState({ ...this.state(), [namespace]: e }, "", url)
    return e
  }

  activate(e: ScrollEntry) {
    this.rendered = e
    this.active = true
  }

  suspend() {
    this.active = false
  }

  cancelRestore() {
    this.stopRestore?.()
    this.win.clearTimeout(this.scrollTimer)
    this.scrollTimer = undefined
  }

  restore(url: URL, saved?: ScrollPosition) {
    this.cancelRestore()
    const win = this.win
    // Top does not depend on layout. Set it once at commit, with no retries.
    if (saved ? saved.x === 0 && saved.y === 0 : !url.hash) {
      win.scrollTo({ left: 0, top: 0, behavior: "instant" })
      return
    }
    // Only one owner may compensate for late layout. With native anchoring
    // also active, a 500px insertion above the reader looks just like a drag.
    const root = win.document.documentElement
    const anchor = root.style.overflowAnchor
    root.style.overflowAnchor = "none"
    let applied: ScrollPosition | undefined
    const apply = () => {
      if (yieldIfMoved()) return
      const p = scrollDestination(win, url, saved)
      win.scrollTo({ left: p.x, top: p.y, behavior: "instant" })
      // Read the actual, possibly clamped position, not the requested one.
      applied = { x: win.scrollX, y: win.scrollY }
    }
    const timers: number[] = []
    let frame: number | undefined
    const listeners = new AbortController()
    const yieldIfMoved = () => {
      if (!applied || (win.scrollX === applied.x && win.scrollY === applied.y)) return false
      // Layout shrink can clamp the viewport even with anchoring disabled.
      if (
        win.scrollX === Math.min(applied.x, root.scrollWidth - root.clientWidth) &&
        win.scrollY === Math.min(applied.y, root.scrollHeight - root.clientHeight)
      )
        return false
      stop()
      this.capture()
      return true
    }
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (frame !== undefined) return
            frame = win.requestAnimationFrame(() => {
              frame = undefined
              apply()
            })
          })
    const stop = () => {
      timers.forEach((timer) => win.clearTimeout(timer))
      if (frame !== undefined) win.cancelAnimationFrame(frame)
      observer?.disconnect()
      listeners.abort()
      root.style.overflowAnchor = anchor
      this.stopRestore = undefined
    }
    this.stopRestore = stop
    watchScrollInput(win, stop, listeners.signal)
    win.addEventListener("scroll", yieldIfMoved, { passive: true, signal: listeners.signal })
    observer?.observe(win.document.body)
    apply()
    for (const ms of [80, 240, 720, 1600]) timers.push(win.setTimeout(apply, ms))
    timers.push(
      win.setTimeout(() => {
        stop()
        this.capture()
      }, 1800),
    )
  }
}
