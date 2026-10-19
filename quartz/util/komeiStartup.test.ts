import test from "node:test"
import assert from "node:assert/strict"
import { installKomeiStartup, type StartupWindow } from "./komeiStartup"

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
  const start = (fontPlan?: Array<{ family: string; weights: number[] }>) =>
    installKomeiStartup(win as unknown as Window, doc as unknown as Document, slug, fontPlan)
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

function pendingFonts(f: ReturnType<typeof fixture>) {
  const loads: Array<{ font: string; finish: () => void }> = []
  Object.assign(f.doc, {
    fonts: {
      load: (font: string) =>
        new Promise((resolve) => {
          loads.push({ font, finish: () => resolve([{ status: "loaded" }]) })
        }),
    },
    createTreeWalker: () => {
      let visited = false
      return {
        nextNode: () => {
          if (visited) return null
          visited = true
          return { textContent: "首页", parentElement: { closest: () => null } }
        },
      }
    },
  })
  return loads
}

test("startup: cold fonts enable only as a complete group before the painted handoff", async () => {
  const f = fixture()
  const loads = pendingFonts(f)
  f.start([{ family: "Noto Serif SC", weights: [500, 700] }])
  assert.equal(f.root.dataset.komeiFontPhase, "pending")
  const run = f.prepare()!
  assert.equal(loads.length, 2)
  assert.ok(loads.every(({ font }) => !font.includes("italic")))
  assert.ok(run.claim())
  let starts = 0
  run.handoff(() => starts++)
  f.paint()
  f.frame()
  loads[0].finish()
  await new Promise(setImmediate)
  assert.equal(f.root.dataset.komeiFontPhase, "pending", "one face must not change the stack")
  assert.equal(starts, 0)
  f.tick(1500)
  assert.equal(f.root.dataset.komeiFontPhase, "pending", "fonts share the existing preparation cap")
  loads[1].finish()
  await new Promise(setImmediate)
  assert.equal(f.root.dataset.komeiFontPhase, "ready")
  assert.equal(starts, 0, "a complete group still uses the existing next-frame handoff")
  f.frame()
  assert.equal(starts, 1)
  run.complete(run.targets)
  assert.equal(f.timers.size, 0)
})

test("startup: cancellation or the shared font budget locks fallback against late faces", async () => {
  for (const cancel of [true, false]) {
    const f = fixture()
    const loads = pendingFonts(f)
    f.start([{ family: "Noto Sans SC", weights: [400] }])
    const run = f.prepare()!
    assert.ok(run.claim())
    let starts = 0
    run.handoff(() => starts++)
    f.paint()
    if (cancel) f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    else f.tick(3136)
    assert.equal(f.root.dataset.komeiFontPhase, "fallback")
    f.frame()
    assert.equal(starts, cancel ? 0 : 1, "font timeout may release the already-prepared Hero")
    loads[0].finish()
    await new Promise(setImmediate)
    assert.equal(f.root.dataset.komeiFontPhase, "fallback", "no visible late font replacement")
    run.reveal()
    assert.equal(f.timers.size, 0)
  }
})

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
})

test("startup: load deadline is terminal; late GSAP and duplicate nav cannot re-hide", () => {
  const f = fixture()
  f.start()
  assert.equal(f.root.dataset.komeiStartupCold, "index")
  f.paint() // Structural binding is not an animation-library request.
  f.tick(2600)
  assert.equal(f.root.dataset.komeiStartupState, "pending")
  const run = f.prepare()!
  assert.ok(run)
  f.tick(599)
  assert.ok(run.valid())
  f.tick(1) // Real preparation still cannot exceed 3200ms from Head.
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(run.valid(), false)
  assert.equal(run.claim(), false, "a delayed GSAP result cannot reclaim")
  assert.equal(f.prepare(), undefined)
  assert.ok(f.elements.every((e) => !e.dataset.komeiEntry))
  assert.equal(f.navigate("index", "/"), undefined, "same-URL navigation is not an entrance")

  const early = fixture()
  early.start()
  early.tick(400)
  const loading = early.prepare()!
  early.tick(1199)
  assert.ok(loading.valid())
  early.tick(1)
  assert.equal(loading.claim(), false, "library loading has only 1200ms after prepare")
  assert.equal(early.timers.size, 0)

  const about = fixture("about/index", "/about/")
  about.start()
  about.tick(1200)
  assert.equal(about.prepare(), undefined, "about retains its original Head loading budget")
})

test("startup: an early prepared Hero starts only with the painted handoff", () => {
  const f = fixture()
  f.elements[0].style.setProperty("transform", "translateX(2px)")
  f.elements[0].style.setProperty("color", "red")
  f.start()
  const run = f.prepare()!
  assert.equal(run.claim(), true)
  for (const e of f.elements) e.style.setProperty("opacity", "0") // GSAP initial state.
  let starts = 0
  run.handoff(() => starts++)
  assert.equal(starts, 0)
  assert.ok(f.elements.every((e) => e.dataset.komeiEntry))
  f.paint()
  assert.equal(starts, 0, "a paint notification does not start a timeline prepaint")
  f.frame()
  assert.equal(starts, 1)
  assert.ok(f.elements.every((e) => !e.dataset.komeiEntry))
  assert.equal(f.root.dataset.komeiBookmark, undefined, "fast readiness has no separate bookmark")
  run.onReveal(() => f.elements.forEach((e) => e.style.removeProperty("transform")))
  run.complete(run.targets)
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(f.root.dataset.komeiVeil, undefined, "completion also clears a missing CSS end")
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

test("startup: paint waits for a late prepared Hero; only its matching CSS end removes the veil", () => {
  const f = fixture()
  f.start()
  assert.equal(f.root.dataset.komeiVeil, "armed")
  f.paint()
  assert.equal(f.root.dataset.komeiVeil, "armed", "first rendered frame is still empty")
  f.paint()
  assert.equal(f.root.dataset.komeiVeil, "armed", "paint alone cannot reveal a static Hero")
  assert.equal(f.root.dataset.komeiBookmark, "", "a pending cold load has a quiet visual anchor")
  f.tick(2600) // The real nav/consumer can arrive late without an earlier library request.
  const run = f.prepare()!
  assert.ok(run)
  assert.equal(run.claim(), true, "GSAP may claim after the structural RAF and first paint")
  let starts = 0
  run.handoff(() => starts++)
  assert.equal(starts, 0)
  f.frame()
  assert.equal(starts, 1)
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  assert.equal(f.root.dataset.komeiStartupState, "claimed")
  f.paint()
  f.tick(600) // Cross the original Head deadline while the actual Hero is playing.
  assert.ok(run.valid(), "the Head preparation guards cannot kill an already-playing Hero")
  assert.equal(f.root.dataset.komeiVeil, "exiting", "normal removal waits for actual CSS end")
  f.animation("animationend", "other-animation")
  f.animation("animationend", "komei-entry-exit", "::after")
  f.animation("animationend", "komei-entry-exit", "::before", f.body)
  assert.equal(f.root.dataset.komeiVeil, "exiting", "unrelated events cannot remove the veil")
  f.animation()
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.root.dataset.komeiBookmark, undefined)
  f.tick(500)
  assert.ok(run.valid(), "the 1.10s Hero can finish at 3700ms, after the old Head deadline")
  run.complete(run.targets)
  assert.deepEqual((f.win as unknown as StartupWindow).komeiStartup!.homeViewport(), [
    { top: 0, bottom: 900 },
  ])
  assert.equal(f.prepare(), undefined)
  assert.equal(f.timers.size, 0)
  assert.equal(f.frames.size, 0)
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
    const run = f.prepare()!
    assert.ok(run.claim())
    run.handoff()
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

test("startup: missing animation events use the playback guard only after handoff", () => {
  for (const release of ["guard", "cancel", "Tab", "pagehide"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    assert.ok(run.claim())
    run.handoff()
    f.tick(600)
    f.paint()
    f.paint()
    f.tick(600)
    assert.equal(f.root.dataset.komeiVeil, "exiting", release)
    if (release === "guard") {
      f.tick(2599)
      assert.equal(f.root.dataset.komeiVeil, "exiting")
      assert.ok(run.valid())
      f.tick(1) // 3200ms since actual playback began at 600ms.
    }
    if (release === "cancel") f.animation("animationcancel")
    if (release === "Tab") f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
    if (release === "pagehide") f.win.dispatchEvent(new Event("pagehide"))
    assert.equal(f.root.dataset.komeiVeil, undefined, release)
    if (release === "cancel") {
      assert.ok(run.valid(), "cancelling the CSS surface must not kill the claimed Hero")
      run.complete(run.targets)
    }
    assert.equal(f.frames.size, 0, release)
    assert.equal(f.paintObservers.size, 0, release)
    assert.equal(f.timers.size, 0, release)
  }
})

test("startup: a prepaint layout cannot advance an already prepared Hero behind the mist", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  f.frame()
  f.tick(300) // A renderer layout may occupy this entire prepaint interval.
  assert.equal(f.root.dataset.komeiVeil, "armed")
  assert.equal(run.claim(), true)
  let starts = 0
  run.handoff(() => starts++)
  assert.equal(starts, 0)
  assert.equal(f.root.dataset.komeiVeil, "armed", "late GSAP cannot remove the waiting veil")
  f.firstPaint()
  assert.equal(f.root.dataset.komeiVeil, "armed", "paint notification is not another prepaint exit")
  f.frame()
  assert.equal(starts, 1)
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  assert.equal(f.root.dataset.komeiStartupState, "claimed")
  f.tick(239)
  assert.equal(f.root.dataset.komeiVeil, "exiting")
  f.tick(1)
  f.animation()
  run.complete(run.targets)
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.paintObservers.size, 0)
})

test("startup: missing paint cannot outlive the loading or preparation guard", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  f.frame()
  f.tick(100)
  assert.ok(run.valid(), "structure readiness is not the loading deadline")
  assert.equal(f.root.dataset.komeiVeil, "armed")
  f.tick(1100)
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.paintObservers.size, 0)
  assert.equal(f.frames.size, 0)
  assert.equal(f.timers.size, 0)
  assert.equal(run.claim(), false, "late GSAP cannot recreate an entrance after timeout")
  f.firstPaint()
  f.frame()
  assert.equal(f.root.dataset.komeiVeil, undefined)

  const waiting = fixture()
  waiting.start()
  const claimed = waiting.prepare()!
  assert.ok(claimed.claim())
  let starts = 0
  claimed.handoff(() => starts++)
  waiting.frame()
  waiting.tick(3200)
  assert.equal(claimed.valid(), false, "claiming without playback cannot renew preparation")
  waiting.firstPaint()
  waiting.frame()
  assert.equal(starts, 0, "a late paint callback cannot start a terminated run")
  assert.equal(waiting.root.dataset.komeiVeil, undefined)
  assert.equal(waiting.timers.size, 0)
  assert.equal(waiting.frames.size, 0)
})

test("startup: input or leaving cancels a prepared handoff before paint permanently", () => {
  for (const event of ["Tab", "pointerdown", "pagehide", "reduced"]) {
    for (const prepared of [false, true]) {
      const f = fixture()
      f.start()
      const run = prepared ? f.prepare()! : undefined
      let starts = 0
      if (run) {
        assert.ok(run.claim())
        run.handoff(() => starts++)
      }
      f.frame()
      if (event === "Tab") f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
      if (event === "pointerdown") f.doc.dispatchEvent(new Event("pointerdown"))
      if (event === "pagehide") f.win.dispatchEvent(new Event("pagehide"))
      if (event === "reduced") {
        f.reduced.matches = true
        f.reduced.dispatchEvent(new Event("change"))
      }
      f.firstPaint()
      f.frame()
      assert.equal(starts, 0, event)
      assert.equal(run?.valid() ?? false, false, event)
      assert.equal(f.prepare(), undefined, "early cancellation cannot restart a loading budget")
      assert.equal(f.root.dataset.komeiVeil, undefined, event)
      assert.equal(f.root.dataset.komeiBookmark, undefined, event)
      assert.equal(f.paintObservers.size, 0, event)
      assert.equal(f.frames.size, 0, event)
      assert.equal(f.timers.size, 0, event)
    }
  }
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
  f.tick(3199)
  assert.equal(f.root.dataset.komeiStartupState, "pending", "no prepare means no library budget")
  f.tick(1) // A missing main module still terminates at the absolute preparation bound.
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(f.root.dataset.komeiVeil, undefined)
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

test("startup: failure, timeout, focus and lifecycle release claimed styles permanently", () => {
  for (const event of ["failure", "watchdog", "Tab", "reduced", "pagehide", "bfcache"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    assert.equal(run.claim(), true)
    f.elements[0].style.setProperty("visibility", "hidden")
    if (event === "failure") run.reveal()
    if (event === "watchdog") f.tick(3201)
    if (event === "Tab") f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }))
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
    f.paint()
    assert.equal(f.root.dataset.komeiVeil, undefined, "queued paint cannot re-arm a released run")
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
  let starts = 0
  home.handoff(() => starts++)
  assert.equal(starts, 1, "SPA uses the same prepared Hero without a cold waiting surface")
  home.handoff(() => starts++)
  assert.equal(starts, 1, "duplicate handoffs cannot replay the Hero")
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
