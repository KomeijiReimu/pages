export type ScrollPosition = { x: number; y: number }
export type ScrollEntry = { id: string; url: string; position?: ScrollPosition }

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
    const candidate = this.state()[namespace]
    const e: ScrollEntry =
      entry(candidate) && candidate.url === this.win.location.href
        ? { ...candidate }
        : { id: globalThis.crypto.randomUUID(), url: this.win.location.href }
    e.position = this.positions.get(e.id) ?? e.position
    this.replace(e)
    return e
  }

  private matchesRendered() {
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
    let id = url.hash.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      /* Keep malformed hashes literal. */
    }
    const target = () => {
      if (saved) return saved
      const el = id ? win.document.getElementById(id) : null
      return { x: 0, y: el ? el.getBoundingClientRect().top + win.scrollY : 0 }
    }
    const apply = () => {
      const p = target()
      win.scrollTo({ left: p.x, top: p.y, behavior: "instant" })
    }
    const timers: number[] = []
    let frame: number | undefined
    const onKey = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) &&
        !(
          event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable]")
        )
      )
        stop()
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
      win.removeEventListener("wheel", stop)
      win.removeEventListener("touchstart", stop)
      win.removeEventListener("keydown", onKey)
      this.stopRestore = undefined
    }
    this.stopRestore = stop
    win.addEventListener("wheel", stop, { passive: true })
    win.addEventListener("touchstart", stop, { passive: true })
    win.addEventListener("keydown", onKey)
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
