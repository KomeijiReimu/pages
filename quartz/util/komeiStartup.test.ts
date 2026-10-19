import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  installKomeiStartup,
  type StartupWindow,
  startupStyle,
  homeEntrySelectors,
} from "./komeiStartup"
import { criticalFonts, criticalFontStyle, criticalUiText } from "./komeiFonts"
import { googleFontHref, googleFontSubsetHref, joinStyles, type Theme } from "./theme"

class ElementStub {
  dataset: Record<string, string> = {}
  isConnected = true
  properties = new Map<string, string>()
  attributes = new Map<string, string>()
  nextElementSibling: ElementStub | null = null
  contains(element: unknown) {
    return element === this
  }
  hasAttribute(name: string) {
    return name.startsWith("data-")
      ? this.dataset[
          name.replace(/^data-/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        ] !== undefined
      : this.attributes.has(name)
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  style = {
    getPropertyValue: (key: string) => this.properties.get(key) ?? "",
    getPropertyPriority: () => "",
    setProperty: (key: string, value: string) => this.properties.set(key, value),
    removeProperty: (key: string) => this.properties.delete(key),
  }
  removeAttribute(key: string) {
    delete this.dataset[
      key.replace(/^data-/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    ]
  }
}

function fixture(slug = "index", pathname = "/") {
  let now = 0
  let id = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const frames = new Map<number, FrameRequestCallback>()
  const paints: Array<{ name: string; startTime: number }> = []
  const paintObservers = new Set<(entries: { getEntries: () => typeof paints }) => void>()
  const reduced = Object.assign(new EventTarget(), { matches: false })
  const root = new ElementStub()
  const body = new ElementStub()
  body.dataset.slug = slug
  let container = new ElementStub()
  let elements = [new ElementStub(), new ElementStub()]
  const doc = Object.assign(new EventTarget(), {
    documentElement: root,
    body,
    readyState: "loading",
    querySelector: () => container,
    querySelectorAll: () => elements,
  })
  const win = Object.assign(new EventTarget(), {
    location: { pathname, search: "" },
    performance: { now: () => now, getEntriesByType: () => paints },
    matchMedia: (_query: string) => reduced,
    localStorage: { getItem: (): string | null => null },
    scrollY: 0,
    innerHeight: 900,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    PerformanceObserver: class {
      static supportedEntryTypes: string[] = ["paint"]
      constructor(private callback: (entries: { getEntries: () => typeof paints }) => void) {}
      observe() {
        paintObservers.add(this.callback)
      }
      disconnect() {
        paintObservers.delete(this.callback)
      }
    },
    requestAnimationFrame(fn: FrameRequestCallback) {
      frames.set(++id, fn)
      return id
    },
    cancelAnimationFrame(frame: number) {
      frames.delete(frame)
    },
    setTimeout(fn: () => void, ms: number) {
      timers.set(++id, { at: now + ms, fn })
      return id
    },
    clearTimeout(timer: number) {
      timers.delete(timer)
    },
  })
  const start = () =>
    installKomeiStartup(win as unknown as Window, doc as unknown as Document, slug)
  const prepare = () => (win as unknown as StartupWindow).komeiStartup!.prepare(body.dataset.slug)
  const frame = () => {
    doc.readyState = "interactive"
    doc.dispatchEvent(new Event("readystatechange"))
    for (const [id, fn] of [...frames]) {
      frames.delete(id)
      fn(now)
    }
  }
  const firstPaint = () => {
    if (paints.length) return
    paints.push({ name: "first-paint", startTime: now })
    for (const notify of [...paintObservers]) notify({ getEntries: () => paints })
  }
  return {
    root,
    body,
    win,
    doc,
    reduced,
    timers,
    frames,
    start,
    prepare,
    frame,
    firstPaint,
    paintObservers,
    animation(
      type = "animationend",
      animationName = "komei-entry-exit",
      pseudoElement = "::before",
      target: unknown = root,
    ) {
      const event = new Event(type)
      Object.defineProperties(event, {
        target: { value: target },
        animationName: { value: animationName },
        pseudoElement: { value: pseudoElement },
      })
      doc.dispatchEvent(event)
    },
    paint() {
      frame()
      firstPaint()
    },
    get elements() {
      return elements
    },
    tick(ms: number) {
      now += ms
      for (const [key, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(key)
          timer.fn()
        }
      }
    },
    navigate(nextSlug: string, path: string, fresh = true) {
      doc.dispatchEvent(new Event("prenav"))
      body.dataset.slug = nextSlug
      win.location.pathname = path
      if (fresh) {
        container.isConnected = false
        container = new ElementStub()
        elements = [new ElementStub(), new ElementStub()]
      }
      return prepare()
    },
  }
}

test("startup: notes and reduced cold documents never acquire a hidden state", () => {
  for (const slug of ["notes/example", "posts/example", "categories/index"]) {
    const f = fixture(slug, `/${slug}`)
    f.start()
    assert.equal(f.prepare(), undefined)
    assert.equal(f.timers.size, 0)
    assert.equal(f.root.dataset.komeiStartupCold, undefined)
  }
  const f = fixture()
  f.reduced.matches = true
  f.start()
  assert.equal(f.prepare(), undefined)
  assert.equal(f.timers.size, 0)
  // With blocked/no JavaScript, CSS alone contains no default-hidden root/body rule.
  assert.doesNotMatch(startupStyle, /(?:body|:root)\s*\{[^}]*opacity/)
})

test("startup: load deadline is terminal; late GSAP and duplicate nav cannot re-hide", () => {
  const f = fixture()
  f.start()
  assert.equal(f.timers.size, 3, "Hero guards and the bounded CSS safety clock are armed")
  assert.equal(f.root.dataset.komeiStartupCold, "index")
  const run = f.prepare()!
  assert.ok(run)
  f.tick(1201)
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(run.valid(), false)
  assert.equal(run.claim(), false, "a delayed GSAP result cannot reclaim")
  assert.equal(f.prepare(), undefined)
  assert.ok(f.elements.every((e) => !e.dataset.komeiEntry))
  assert.equal(f.navigate("index", "/"), undefined, "same-URL navigation is not an entrance")
})

test("startup: successful synchronous handoff restores only this run's styles", () => {
  const f = fixture()
  f.elements[0].style.setProperty("transform", "translateX(2px)")
  f.elements[0].style.setProperty("color", "red")
  f.start()
  const run = f.prepare()!
  assert.equal(run.claim(), true)
  for (const e of f.elements) e.style.setProperty("opacity", "0") // GSAP initial state.
  run.handoff()
  assert.ok(f.elements.every((e) => !e.dataset.komeiEntry))
  run.onReveal(() => f.elements.forEach((e) => e.style.removeProperty("transform")))
  run.complete(run.targets)
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(f.elements[0].style.getPropertyValue("transform"), "translateX(2px)")
  assert.equal(f.elements[0].style.getPropertyValue("color"), "red")
  assert.ok(f.elements.every((e) => !e.style.getPropertyValue("opacity")))
  f.paint()
  f.paint()
  f.tick(240)
  f.animation()
  assert.equal(f.timers.size, 0)
  assert.equal(run.claim(), false)
})

test("startup: painted T0 opens without nav or GSAP and is terminal for late claim", () => {
  const f = fixture()
  f.start()
  assert.equal(f.root.dataset.komeiVeil, "armed")
  const run = f.prepare()!
  f.paint()
  assert.equal(f.root.dataset.komeiVeil, "armed", "first rendered frame is still empty")
  f.paint()
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(run.claim(), false)
  f.paint()
  f.tick(239)
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  f.tick(1)
  assert.equal(f.root.dataset.komeiVeil, "exiting", "normal removal waits for actual CSS end")
  f.animation()
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.deepEqual((f.win as unknown as StartupWindow).komeiStartup!.homeViewport(), [
    { top: 0, bottom: 900 },
  ])
  assert.equal(f.prepare(), undefined)
})

test("startup: an existing Observer without paint support exits on the next RAF", () => {
  for (const supported of [["resource"], undefined]) {
    const f = fixture()
    let observed = 0
    class SilentObserver extends f.win.PerformanceObserver {
      override observe() {
        observed++
      }
    }
    Object.defineProperty(SilentObserver, "supportedEntryTypes", { value: supported })
    f.win.PerformanceObserver = SilentObserver
    f.start()
    f.frame()
    assert.equal(observed, 0, "unsupported paint must not be observed, even if observe is silent")
    assert.equal(f.paintObservers.size, 0)
    assert.equal(f.root.dataset.komeiVeil, "armed")
    f.frame()
    assert.equal(f.root.dataset.komeiVeil, "exiting", "do not wait for the 1200ms guard")
    f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    assert.equal(f.root.dataset.komeiVeil, undefined)
    assert.equal(f.frames.size, 0)
    assert.equal(f.timers.size, 0)
  }
})

test("startup: veil follows its actual pseudo animation, not the exit RAF timer", () => {
  const f = fixture()
  f.start()
  f.paint()
  f.paint()
  f.tick(300) // CSS may start later than the exit RAF after a rendering delay.
  assert.equal(f.root.dataset.komeiVeil, "exiting", "240ms must not cancel a live animation")
  f.animation("animationend", "other-animation")
  f.animation("animationend", "komei-entry-exit", "::after")
  f.animation("animationend", "komei-entry-exit", "::before", f.body)
  assert.equal(f.root.dataset.komeiVeil, "exiting", "unrelated animation events are ignored")
  f.animation()
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.timers.size, 0)
  assert.equal(f.frames.size, 0)
  f.animation()
  f.frame()
  assert.equal(f.root.dataset.komeiVeil, undefined, "late events do not re-arm")
})

test("startup: missing animation events keep only the original absolute safety bound", () => {
  for (const release of ["guard", "cancel", "Tab", "pagehide"]) {
    const f = fixture()
    f.start()
    f.tick(600)
    f.paint()
    f.paint()
    f.tick(600)
    assert.equal(f.root.dataset.komeiVeil, "exiting", release)
    if (release === "guard") {
      f.tick(1999)
      assert.equal(f.root.dataset.komeiVeil, "exiting")
      f.tick(1) // 3200ms since arm, not 3200ms since exit.
    }
    if (release === "cancel") f.animation("animationcancel")
    if (release === "Tab") f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    if (release === "pagehide") f.win.dispatchEvent(new Event("pagehide"))
    assert.equal(f.root.dataset.komeiVeil, undefined, release)
    assert.equal(f.frames.size, 0, release)
    assert.equal(f.paintObservers.size, 0, release)
    assert.equal(f.timers.size, 0, release)
  }
})

test("startup: retreat waits for a painted empty frame, not a prepaint RAF", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  f.frame()
  f.tick(300) // A renderer layout may occupy this entire prepaint interval.
  assert.equal(f.root.dataset.komeiVeil, "armed")
  assert.equal(run.claim(), false, "structural admission still closes before paint")
  assert.equal(f.root.dataset.komeiVeil, "armed", "late GSAP cannot remove the waiting veil")
  f.firstPaint()
  assert.equal(f.root.dataset.komeiVeil, "armed", "paint notification is not another prepaint exit")
  f.frame()
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  f.tick(239)
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  f.tick(1)
  f.animation()
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.paintObservers.size, 0)
})

test("startup: completed Hero preserves the empty paint; guards and input still cancel it", () => {
  for (const release of ["paint", "guard", "Tab", "pagehide", "route", "reduced", "bfcache"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    assert.ok(run.claim())
    run.complete(run.targets)
    assert.equal(f.root.dataset.komeiVeil, "armed", release)
    f.frame()
    if (release === "paint") {
      f.firstPaint()
      f.frame()
      f.tick(240)
      f.animation()
    }
    if (release === "guard") f.tick(3201)
    if (release === "Tab") f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    if (release === "pagehide") f.win.dispatchEvent(new Event("pagehide"))
    if (release === "route") f.doc.dispatchEvent(new Event("prenav"))
    if (release === "reduced") {
      f.reduced.matches = true
      f.reduced.dispatchEvent(new Event("change"))
    }
    if (release === "bfcache")
      f.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    assert.equal(f.root.dataset.komeiVeil, undefined, release)
    assert.equal(f.paintObservers.size, 0, release)
    assert.equal(f.frames.size, 0, release)
    assert.equal(run.valid(), false, release)
    f.firstPaint()
    f.frame()
    assert.equal(f.root.dataset.komeiVeil, undefined, "queued notification must not resurrect veil")
  }
})

test("startup: missing paint cannot outlive the original pending load guard", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  f.frame()
  f.tick(100)
  assert.equal(run.claim(), false)
  assert.equal(f.root.dataset.komeiVeil, "armed")
  f.tick(1100)
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.paintObservers.size, 0)
  assert.equal(f.frames.size, 0)
  assert.equal(f.timers.size, 0)
  f.firstPaint()
  f.frame()
  assert.equal(f.root.dataset.komeiVeil, undefined)
})

test("startup: T0 does not release a previously claimed Hero; 3200ms stays its guard", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  assert.ok(run.claim())
  run.handoff()
  f.paint()
  f.paint()
  f.tick(240)
  f.animation()
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.ok(run.valid())
  f.tick(2959)
  assert.ok(run.valid())
  f.tick(1)
  assert.equal(run.valid(), false)
  assert.equal(f.timers.size, 0)
})

test("startup: no-module T0 and Tab fail open without waiting for the loading guard", () => {
  for (const tab of [false, true]) {
    const f = fixture()
    f.start()
    if (tab) f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    else {
      f.paint()
      f.paint()
    }
    assert.equal(f.root.dataset.komeiStartupCold, undefined)
    assert.equal(f.prepare(), undefined)
    assert.equal(f.root.dataset.komeiStartupState, "revealed")
  }
})

test("startup: entry respects stored theme before system, including blocked storage", () => {
  for (const stored of ["light", "dark", "invalid", "blocked"]) {
    const f = fixture()
    const dark = Object.assign(new EventTarget(), { matches: true })
    f.win.matchMedia = (query) => (query.includes("color-scheme") ? dark : f.reduced)
    f.win.localStorage.getItem = () => {
      if (stored === "blocked") throw new Error("blocked")
      return stored
    }
    f.start()
    assert.equal(f.root.getAttribute("saved-theme"), stored === "light" ? "light" : "dark")
  }
})

test("startup: static cold fallback remembers retained Hero and only actual viewport intervals", () => {
  const f = fixture()
  f.start()
  f.paint()
  f.paint()
  f.paint()
  f.win.scrollY = 1800
  f.win.dispatchEvent(new Event("scroll"))
  assert.deepEqual((f.win as unknown as StartupWindow).komeiStartup!.homeViewport(), [
    { top: 0, bottom: 900 },
    { top: 1800, bottom: 2700 },
  ])
  assert.equal(f.prepare(), undefined)
  assert.equal(f.navigate("notes/example", "/notes/example", false), undefined)
  assert.equal(
    f.navigate("index", "/", false),
    undefined,
    "retained fallback Hero is never re-gated",
  )
})

test("startup: a target-discovery exception releases the cold CSS gate immediately", () => {
  const f = fixture()
  f.start()
  f.doc.querySelectorAll = () => {
    throw new Error("injected discovery failure")
  }
  assert.equal(f.prepare(), undefined)
  assert.equal(f.root.dataset.komeiStartupCold, undefined)
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(f.timers.size, 0)
})

test("startup: Hero illustration shares the gate and restores scale without owning the global background", () => {
  assert.ok(homeEntrySelectors.includes(".komei-home-hero__backdrop"))
  assert.ok(!homeEntrySelectors.includes(".komei-background-layer"))
  assert.match(startupStyle, /html\[data-komei-startup-cold="index"\] \.komei-home-hero__backdrop/)
  for (const end of ["complete", "watchdog", "load-deadline"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    const backdrop = f.elements[0]
    assert.ok(backdrop.dataset.komeiEntry, "illustration starts behind the same gate")
    if (end === "load-deadline") {
      f.tick(1201)
    } else {
      assert.equal(run.claim(), true)
      backdrop.style.setProperty("transform", "scale(1.02)")
      backdrop.style.setProperty("opacity", "0")
      run.handoff()
      if (end === "complete") {
        run.complete([backdrop as unknown as HTMLElement])
        assert.equal(run.valid(), true, "other text targets still belong to the run")
        run.complete(run.targets)
      } else f.tick(3201)
    }
    assert.equal(backdrop.style.getPropertyValue("transform"), "", end)
    assert.equal(backdrop.style.getPropertyValue("opacity"), "", end)
    assert.equal(backdrop.dataset.komeiEntry, undefined, end)
    assert.equal(run.claim(), false, "late image/GSAP cannot reclaim a revealed run")
    assert.equal(f.prepare(), undefined, "duplicate nav cannot replay the illustration")
  }
})

test("startup: initialization failure, stalled tween, reduced motion and lifecycle all fail open", () => {
  for (const event of ["failure", "watchdog", "reduced", "pagehide", "bfcache"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    assert.equal(run.claim(), true)
    f.elements[0].style.setProperty("visibility", "hidden")
    if (event === "failure") run.reveal()
    if (event === "watchdog") f.tick(3201)
    if (event === "reduced") {
      f.reduced.matches = true
      f.reduced.dispatchEvent(new Event("change"))
    }
    if (event === "pagehide") f.win.dispatchEvent(new Event("pagehide"))
    if (event === "bfcache")
      f.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    assert.equal(run.valid(), false, event)
    assert.equal(run.claim(), false, event)
    assert.ok(
      f.elements.every((e) => !e.dataset.komeiEntry && !e.style.getPropertyValue("visibility")),
      event,
    )
    assert.equal(f.timers.size, 0, event)
  }
})

test("startup: SPA returns animate fresh presentation targets, not original or reading targets", () => {
  const f = fixture()
  f.start()
  const cold = f.prepare()!
  cold.reveal()
  assert.equal(f.navigate("notes/example", "/notes/example"), undefined)
  const home = f.navigate("index", "/")!
  assert.ok(home)
  assert.equal(home.claim(), true)
  home.handoff()
  home.complete(home.targets)
  assert.equal(f.prepare(), undefined)
  assert.equal(f.navigate("notes/example", "/notes/example", false), undefined)
  assert.equal(
    f.navigate("index", "/", false),
    undefined,
    "already revealed original nodes stay visible",
  )
  const about = f.navigate("about/index", "/about/")!
  assert.ok(about)
  assert.equal(about.claim(), true)
  f.navigate("posts/example", "/posts/example")
  assert.equal(about.valid(), false)
})

test("fonts: finite public UI assets, real declared roles, optional display and serif fallback", () => {
  const base = new URL("../static/fonts/startup/", import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", base), "utf8"))
  assert.equal(manifest.text, criticalUiText)
  let total = 0
  for (const font of criticalFonts) {
    const entry = manifest.fonts.find((f: { file: string }) => f.file === font.file)
    const bytes = readFileSync(new URL(font.file, base))
    assert.equal(bytes.toString("ascii", 0, 4), "wOF2")
    assert.equal(entry.weight, font.weight)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256)
    total += bytes.length
  }
  assert.ok(total <= 300_000)
  const css = criticalFontStyle("")
  assert.match(css, /font-display: optional/)
  assert.match(css, /unicode-range:/)
  assert.doesNotMatch(css, /display:\s*(swap|block)/)
  const theme = {
    typography: {
      header: { name: "Noto Serif SC", weights: [500, 700] },
      body: { name: "Noto Sans SC", weights: [400, 600] },
      code: "IBM Plex Mono",
    },
    colors: { lightMode: {}, darkMode: {} },
  } as Theme
  assert.match(googleFontHref(theme), /display=optional/)
  assert.match(googleFontSubsetHref(theme, "public title"), /display=optional/)
  assert.match(
    joinStyles(theme),
    /--headerFont: "Komei UI Serif", "Noto Serif SC", "Noto Serif CJK SC"/,
  )
  assert.match(joinStyles(theme), /--bodyFont: "Komei UI Sans", "Noto Sans SC"/)
})
