import test from "node:test"
import assert from "node:assert/strict"
import { installKomeiStartup, type StartupWindow } from "./komeiStartup"
import type { HomePrelude } from "./komeiPrelude"

class ElementStub {
  dataset: Record<string, string> = {}
  isConnected = true
  properties = new Map<string, string>()
  attributes = new Map<string, string>()
  nextElementSibling: ElementStub | null = null
  children: ElementStub[] = []
  className = ""
  appendChild(element: ElementStub) {
    this.children.push(element)
  }
  remove() {
    this.isConnected = false
  }
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
  const prelude = {
    created: 0,
    entered: 0,
    exited: 0,
    disposed: 0,
    ready: () => {},
    gone: () => {},
    enterTimeoutMs: 4600,
    exitTimeoutMs: 1800,
    enter(ready: () => void) {
      this.entered++
      this.ready = ready
    },
    exit(gone: () => void) {
      this.exited++
      this.gone = gone
    },
    dispose() {
      this.disposed++
    },
  }
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
    createElement: () => new ElementStub(),
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
  const start = (
    fontPlan?: Array<{ family: string; weights: number[] }>,
    factory = (): HomePrelude => {
      prelude.created++
      return prelude
    },
  ) =>
    installKomeiStartup(
      win as unknown as Window,
      doc as unknown as Document,
      slug,
      fontPlan,
      factory,
    )
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
    prelude,
    timers,
    frames,
    start,
    prepare,
    frame,
    firstPaint,
    paintObservers,
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

test("startup: the whole font group settles before visual admission", async () => {
  const f = fixture()
  const loads = pendingFonts(f)
  f.start([{ family: "Noto Serif SC", weights: [500, 700] }])
  const run = f.prepare()!
  assert.ok(run.claim())
  let starts = 0
  run.handoff(() => starts++)
  f.paint()
  f.frame()
  assert.equal(loads.length, 2)
  assert.ok(loads.every(({ font }) => !font.includes("italic")))
  loads[0].finish()
  await new Promise(setImmediate)
  assert.equal(f.root.dataset.komeiFontPhase, "pending")
  assert.equal(f.prelude.entered, 0)
  loads[1].finish()
  await new Promise(setImmediate)
  assert.equal(f.root.dataset.komeiFontPhase, "ready")
  f.frame()
  assert.equal(f.prelude.entered, 1)
  assert.equal(starts, 0)
  f.prelude.ready()
  assert.equal(starts, 1)
  f.prelude.gone()
  run.complete(run.targets)
  assert.equal(f.timers.size, 0)
})

test("startup: font fallback is terminal on timeout or cancellation", async () => {
  for (const cancel of [true, false]) {
    const f = fixture()
    const loads = pendingFonts(f)
    f.start([{ family: "Noto Sans SC", weights: [400] }])
    const run = f.prepare()!
    assert.ok(run.claim())
    run.handoff()
    f.paint()
    if (cancel) f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }))
    else f.tick(3136)
    assert.equal(f.root.dataset.komeiFontPhase, "fallback")
    f.frame()
    assert.equal(f.prelude.entered, cancel ? 0 : 1)
    loads[0].finish()
    await new Promise(setImmediate)
    assert.equal(f.root.dataset.komeiFontPhase, "fallback")
    run.reveal()
    assert.equal(f.timers.size, 0)
  }
})

test("startup: notes and reduced cold documents never acquire hidden state", () => {
  for (const slug of ["notes/example", "posts/example", "categories/index", "index"]) {
    const f = fixture(slug, `/${slug}`)
    f.reduced.matches = slug === "index"
    f.start()
    assert.equal(f.prepare(), undefined)
    assert.equal(f.timers.size, 0)
    assert.equal(f.root.dataset.komeiStartupCold, undefined)
    assert.equal(f.prelude.created, 0)
  }
})

test("startup: Head and first-prepare library bounds never admit late resources", () => {
  for (const prepareAt of [400, 2600]) {
    const f = fixture()
    f.start()
    f.paint()
    f.tick(prepareAt)
    const run = f.prepare()!
    const remaining = Math.min(1200, 3200 - prepareAt)
    f.tick(remaining - 1)
    assert.ok(run.valid())
    f.tick(1)
    assert.equal(run.claim(), false)
    run.handoff(() => assert.fail("late GSAP must not play"))
    f.paint()
    assert.equal(f.prelude.entered, 0, "no foreground playback without a live claimed Hero")
    assert.equal(f.prepare(), undefined)
    assert.equal(f.navigate("index", "/"), undefined)
    assert.equal(f.timers.size, 0)
  }
  const about = fixture("about/index", "/about/")
  about.start()
  about.tick(1200)
  assert.equal(about.prepare(), undefined)
})

test("startup: handoff opens CSS and plays Hero in the same callback as exit", () => {
  const f = fixture()
  f.elements[0].style.setProperty("transform", "translateX(2px)")
  f.start()
  const controller = (f.win as unknown as StartupWindow).komeiStartup!
  let opened = 0
  const unsubscribe = controller.onHomeOpen(() => opened++)
  const run = f.prepare()!
  assert.ok(run.claim())
  f.elements.forEach((e) => e.style.setProperty("opacity", "0"))
  let starts = 0
  run.handoff(() => {
    starts++
    assert.equal(f.root.dataset.komeiHomeDevelop, "1")
    assert.ok(f.elements.every((e) => !e.dataset.komeiEntry))
  })
  assert.equal(f.prelude.created, 0)
  f.paint()
  assert.equal(f.prelude.entered, 0, "paint notification alone does not play prepaint")
  f.frame()
  assert.equal(f.prelude.entered, 1)
  assert.equal(controller.homeOpen(), false)
  assert.equal(starts, 0)
  f.win.scrollY = 1700
  f.win.dispatchEvent(new Event("scroll"))
  assert.equal(controller.homeViewport(), undefined, "covered geometry is not exposure")
  f.prelude.ready()
  assert.equal(starts, 1)
  assert.equal(f.prelude.exited, 1, "exit is called synchronously, without another frame")
  assert.equal(controller.homeOpen(), false, "exit still occludes the body")
  run.handoff(() => starts++)
  f.prelude.ready()
  assert.equal(starts, 1)
  run.onReveal(() => f.elements.forEach((e) => e.style.removeProperty("transform")))
  run.complete(run.targets)
  assert.equal(f.prelude.disposed, 0, "Hero completion cannot cut off the separate exit")
  f.prelude.gone()
  f.prelude.gone()
  assert.equal(controller.homeOpen(), true)
  assert.equal(opened, 1)
  assert.equal(f.prelude.disposed, 1)
  assert.deepEqual(controller.homeViewport(), [{ top: 1700, bottom: 2600 }])
  assert.equal(f.elements[0].style.getPropertyValue("transform"), "translateX(2px)")
  assert.ok(f.elements.every((e) => !e.style.getPropertyValue("opacity")))
  assert.equal(f.frames.size + f.timers.size, 0)
  unsubscribe()
})

test("startup: late paint admits a full visual budget; Hero guard starts only at handoff", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  assert.ok(run.claim())
  let starts = 0
  run.handoff(() => starts++)
  f.frame()
  f.tick(2600)
  f.firstPaint()
  f.frame()
  assert.equal(f.prelude.entered, 1)
  f.tick(3500) // Visual duration exceeds both preparation and Hero guard lengths.
  run.handoff(() => starts++)
  assert.ok(run.valid())
  assert.equal(starts, 0)
  f.prelude.ready()
  assert.equal(starts, 1)
  f.tick(1799)
  assert.ok(run.valid())
  f.prelude.gone()
  f.tick(1400)
  assert.ok(run.valid(), "the whole 3200ms belongs to actual Hero playback")
  f.tick(1)
  assert.equal(run.valid(), false)
  assert.equal(f.timers.size, 0)
})

test("startup: missing paint or missing module cannot be revived by a late callback", () => {
  for (const claimed of [false, true]) {
    const f = fixture()
    f.start()
    const run = claimed ? f.prepare()! : undefined
    if (run) {
      assert.ok(run.claim())
      run.handoff(() => assert.fail("terminated run must not play"))
    }
    f.frame()
    f.tick(3200)
    f.firstPaint()
    f.frame()
    assert.equal(f.prepare(), undefined)
    assert.equal(f.prelude.entered, 0)
    assert.equal(f.root.dataset.komeiVeil, undefined)
    assert.equal(f.timers.size + f.frames.size + f.paintObservers.size, 0)
  }
})

test("startup: unsupported Paint Timing uses a next-frame admission", () => {
  for (const supported of [["resource"], undefined]) {
    const f = fixture()
    Object.defineProperty(f.win.PerformanceObserver, "supportedEntryTypes", { value: supported })
    f.start()
    const run = f.prepare()!
    assert.ok(run.claim())
    run.handoff()
    f.frame()
    assert.equal(f.prelude.entered, 0)
    assert.equal(f.paintObservers.size, 0)
    f.frame()
    assert.equal(f.prelude.entered, 1)
    run.reveal()
    assert.equal(f.timers.size, 0)
  }
})

test("startup: visual failure bounds are independent and cannot be renewed", () => {
  for (const phase of ["enter", "exit"]) {
    const f = fixture()
    f.start()
    const run = f.prepare()!
    assert.ok(run.claim())
    let starts = 0
    run.handoff(() => starts++)
    f.paint()
    f.frame()
    if (phase === "exit") f.prelude.ready()
    const budget = phase === "exit" ? f.prelude.exitTimeoutMs : f.prelude.enterTimeoutMs
    f.tick(budget - 1)
    run.handoff()
    assert.equal(f.prelude.disposed, 0)
    f.tick(1)
    assert.equal(f.prelude.disposed, 1)
    assert.equal(f.root.dataset.komeiVeil, undefined)
    f.prelude.ready()
    assert.equal(starts, phase === "exit" ? 1 : 0)
    assert.equal(run.valid(), phase === "exit", "exit timeout does not kill a playing Hero")
    run.reveal()
    assert.equal(f.timers.size, 0)
  }
})

test("startup: a route-invalid run cannot start Hero or exit a foreground alone", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  assert.ok(run.claim())
  let starts = 0
  run.handoff(() => starts++)
  f.paint()
  f.frame()
  f.win.location.pathname = "/notes/example"
  f.prelude.ready()
  assert.equal(starts, 0)
  assert.equal(f.prelude.exited, 0)
  assert.equal(f.prelude.disposed, 1)
  assert.equal(f.root.dataset.komeiVeil, undefined)
  assert.equal(f.timers.size, 0)
})

test("startup: factory or phase failures immediately restore the real page", () => {
  for (const phase of ["factory", "enter", "exit"]) {
    const f = fixture()
    const fail = () => {
      throw new Error("injected prelude failure")
    }
    if (phase === "enter") f.prelude.enter = fail
    if (phase === "exit") f.prelude.exit = fail
    f.start(undefined, phase === "factory" ? fail : () => f.prelude)
    const run = f.prepare()!
    assert.ok(run.claim())
    run.handoff()
    f.paint()
    f.frame()
    if (phase === "exit") f.prelude.ready()
    assert.equal(run.valid(), false)
    assert.equal(f.prelude.disposed, phase === "factory" ? 0 : 1)
    assert.equal(f.root.dataset.komeiVeil, undefined)
    assert.equal(f.timers.size, 0)
  }
})

test("startup: ordinary input is not cancellation, capture, or scroll restoration", () => {
  const f = fixture()
  f.start()
  const run = f.prepare()!
  assert.ok(run.claim())
  run.handoff()
  for (const visual of [false, true]) {
    if (visual) {
      f.paint()
      f.frame()
    }
    f.win.scrollY = visual ? 800 : 400
    for (const type of ["wheel", "pointerdown", "click", "keydown", "focusin"]) {
      const event = Object.assign(new Event(type, { cancelable: true }), { key: "Enter" })
      f.doc.dispatchEvent(event)
      assert.equal(event.defaultPrevented, false)
      assert.ok(run.valid())
    }
    assert.equal(f.win.scrollY, visual ? 800 : 400)
  }
  f.prelude.ready()
  f.prelude.gone()
  run.complete(run.targets)
})

test("startup: cancellation releases every phase and stale factory callbacks stay dead", () => {
  for (const phase of ["prepare", "enter", "exit"]) {
    for (const event of ["Escape", "focus", "prenav", "pagehide", "bfcache", "reduced"]) {
      const f = fixture()
      f.start()
      const run = f.prepare()!
      assert.ok(run.claim())
      let starts = 0
      run.handoff(() => starts++)
      if (phase !== "prepare") {
        f.paint()
        f.frame()
      }
      if (phase === "exit") f.prelude.ready()
      if (event === "Escape")
        f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: event }))
      if (event === "focus") {
        const focus = new Event("focusin")
        Object.defineProperty(focus, "target", { value: f.elements[0] })
        f.doc.dispatchEvent(focus)
      }
      if (event === "prenav") f.doc.dispatchEvent(new Event(event))
      if (event === "pagehide") f.win.dispatchEvent(new Event(event))
      if (event === "bfcache")
        f.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
      if (event === "reduced") {
        f.reduced.matches = true
        f.reduced.dispatchEvent(new Event("change"))
      }
      f.prelude.ready()
      f.prelude.gone()
      f.paint()
      assert.equal(starts, phase === "exit" ? 1 : 0, `${phase}/${event}`)
      assert.equal(run.valid(), false)
      assert.equal(f.root.dataset.komeiVeil, undefined)
      assert.equal(f.timers.size + f.frames.size + f.paintObservers.size, 0)
    }
  }
})

test("startup: theme precedes system, including blocked storage", () => {
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

test("startup: static fallback remembers retained Hero and actual viewport intervals", () => {
  const f = fixture()
  f.start()
  f.paint()
  f.tick(3200)
  f.win.scrollY = 1800
  f.win.dispatchEvent(new Event("scroll"))
  assert.deepEqual((f.win as unknown as StartupWindow).komeiStartup!.homeViewport(), [
    { top: 0, bottom: 900 },
    { top: 1800, bottom: 2700 },
  ])
  assert.equal(f.prepare(), undefined)
  assert.equal(f.navigate("notes/example", "/notes/example", false), undefined)
  assert.equal(f.navigate("index", "/", false), undefined)
})

test("startup: target discovery failure releases the cold CSS gate immediately", () => {
  const f = fixture()
  f.start()
  f.doc.querySelectorAll = () => {
    throw new Error("injected discovery failure")
  }
  assert.equal(f.prepare(), undefined)
  assert.equal(f.root.dataset.komeiStartupCold, undefined)
  assert.equal(f.root.dataset.komeiStartupState, "revealed")
  assert.equal(f.timers.size, 0)
  assert.equal(f.prelude.created, 0)
})

test("startup: SPA returns animate fresh targets without a cold foreground", () => {
  const f = fixture()
  f.start()
  f.prepare()!.reveal()
  assert.equal(f.navigate("notes/example", "/notes/example"), undefined)
  const home = f.navigate("index", "/")!
  assert.ok(home.claim())
  let starts = 0
  home.handoff(() => starts++)
  home.handoff(() => starts++)
  assert.equal(starts, 1)
  assert.equal(f.prelude.created, 0)
  home.complete(home.targets)
  assert.equal(f.prepare(), undefined)
  assert.equal(f.navigate("notes/example", "/notes/example", false), undefined)
  assert.equal(f.navigate("index", "/", false), undefined, "retained targets do not replay")
  const about = f.navigate("about/index", "/about/")!
  assert.ok(about.claim())
  f.navigate("posts/example", "/posts/example")
  assert.equal(about.valid(), false)
})
