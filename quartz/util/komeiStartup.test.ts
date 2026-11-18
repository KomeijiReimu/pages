import test from "node:test"
import assert from "node:assert/strict"
import { installKomeiStartup, type StartupWindow } from "./komeiStartup"

class ElementStub {
  dataset: Record<string, string> = {}
  isConnected = true
  attributes = new Map<string, string>()
  properties = new Map<string, [string, string]>()
  contains(node: unknown) {
    return node === this
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value)
  }
  removeAttribute(key: string) {
    delete this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())]
  }
  style = {
    getPropertyValue: (name: string) => this.properties.get(name)?.[0] ?? "",
    getPropertyPriority: (name: string) => this.properties.get(name)?.[1] ?? "",
    setProperty: (name: string, value: string, priority = "") =>
      this.properties.set(name, [value, priority]),
    removeProperty: (name: string) => this.properties.delete(name),
  }
}

function fixture(slug = "index") {
  let now = 0,
    id = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const frames = new Map<number, () => void>()
  const root = new ElementStub(),
    body = new ElementStub()
  body.dataset.slug = slug
  let container = new ElementStub(),
    elements = [new ElementStub(), new ElementStub()]
  const reduced = Object.assign(new EventTarget(), { matches: false })
  const dark = Object.assign(new EventTarget(), { matches: true })
  const doc = Object.assign(new EventTarget(), {
    body,
    documentElement: root,
    referrer: "",
    visibilityState: "visible",
    querySelector: () => container,
    querySelectorAll: () => elements,
  })
  const navTiming = { type: "navigate" }
  const paint: unknown[] = []
  const win = Object.assign(new EventTarget(), {
    location: { origin: "https://fixture.test", pathname: `/${slug}`, search: "" },
    performance: {
      now: () => now,
      getEntriesByName: () => paint,
      getEntriesByType: () => [navTiming],
    },
    matchMedia: (query: string) => (query.includes("color-scheme") ? dark : reduced),
    localStorage: { getItem: (): string | null => null },
    scrollY: 0,
    innerHeight: 900,
    setTimeout(fn: () => void, ms: number) {
      timers.set(++id, { at: now + ms, fn })
      return id
    },
    clearTimeout(key: number) {
      timers.delete(key)
    },
    requestAnimationFrame(fn: () => void) {
      frames.set(++id, fn)
      return id
    },
    cancelAnimationFrame(key: number) {
      frames.delete(key)
    },
  })
  const controller = () => (win as unknown as StartupWindow).komeiStartup!
  const prepare = () => controller().prepare(body.dataset.slug)
  return {
    win,
    doc,
    reduced,
    paint,
    navTiming,
    root,
    body,
    timers,
    frames,
    controller,
    prepare,
    get elements() {
      return elements
    },
    get container() {
      return container
    },
    start() {
      installKomeiStartup(win as unknown as Window, doc as unknown as Document, slug)
    },
    tick(ms: number, fireTimers = true) {
      now += ms
      if (fireTimers)
        for (const [key, timer] of [...timers]) {
          if (timer.at <= now && timers.delete(key)) timer.fn()
        }
    },
    frame() {
      for (const [key, fn] of [...frames]) {
        frames.delete(key)
        fn()
      }
    },
    scroll(top: number) {
      win.scrollY = top
      win.dispatchEvent(new Event("scroll"))
    },
    navigate(next: string, fresh = true) {
      doc.dispatchEvent(new Event("prenav"))
      body.dataset.slug = next
      win.location.pathname = `/${next}`
      if (fresh) {
        container.isConnected = false
        container = new ElementStub()
        elements = [new ElementStub(), new ElementStub()]
      }
      doc.dispatchEvent(new Event("nav"))
      return prepare()
    },
  }
}

test("direct home is already static: no targets, admission timer, font or DOM dependency", () => {
  const f = fixture()
  f.doc.querySelectorAll = () => assert.fail("Head must not discover or hide home targets")
  Object.defineProperty(f.doc, "fonts", {
    get: () => assert.fail("an unregistered font cannot establish readiness"),
  })
  f.start()
  assert.equal(f.prepare(), undefined)
  assert.equal(f.root.dataset.komeiHomeSignature, "")
  assert.equal(f.root.dataset.komeiStartupCold, undefined)
  assert.equal(f.root.dataset.komeiStartupState, undefined)
  assert.equal(f.timers.size, 0)
  assert.equal(f.root.dataset.komeiFontPhase, "fallback")
  f.tick(60_000)
  f.doc.dispatchEvent(new Event("DOMContentLoaded"))
  assert.equal(f.prepare(), undefined)
  assert.equal(f.root.dataset.komeiFontPhase, "fallback")
  f.doc.dispatchEvent(new Event("prenav"))
  assert.equal(
    f.root.dataset.komeiFontPhase,
    "fallback",
    "outgoing visible home does not switch fonts during fetch",
  )
  assert.equal(f.navigate("library"), undefined)
  assert.equal(f.root.dataset.komeiFontPhase, undefined)
  assert.equal(f.navigate("index"), undefined)
  assert.equal(f.root.dataset.komeiHomeSignature, undefined)
  assert.equal(f.root.dataset.komeiFontPhase, undefined)
})

test("signature only on direct normal motion; leaving, restore and motion changes cannot replay it", () => {
  for (const reason of [
    "reduced",
    "internal",
    "back_forward",
    "prenav",
    "pagehide",
    "persisted",
    "change",
  ]) {
    const f = fixture()
    if (reason === "reduced") f.reduced.matches = true
    if (reason === "internal") f.doc.referrer = `${f.win.location.origin}/library`
    if (reason === "back_forward") f.navTiming.type = reason
    f.start()
    if (reason === "prenav") f.doc.dispatchEvent(new Event(reason))
    if (reason === "pagehide") f.win.dispatchEvent(new Event(reason))
    if (reason === "persisted")
      f.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    if (reason === "change") {
      f.reduced.matches = true
      f.reduced.dispatchEvent(new Event("change"))
    }
    f.reduced.matches = false
    f.reduced.dispatchEvent(new Event("change"))
    f.start() // Duplicate bootstrap cannot add it back.
    assert.equal(f.root.dataset.komeiHomeSignature, undefined, reason)
    assert.equal(f.prepare(), undefined)
  }
})

test("cold home theme precedes system when storage is available", () => {
  for (const theme of ["light", "dark", "invalid", "blocked"]) {
    const f = fixture()
    f.win.localStorage.getItem = () => {
      if (theme === "blocked") throw new Error()
      return theme
    }
    f.start()
    assert.equal(f.root.attributes.get("saved-theme"), theme === "light" ? "light" : "dark")
  }
})

test("viewport history is real, one-shot, and cannot consume an unseen card or skipped interval", () => {
  const early = fixture()
  early.start()
  assert.equal(
    early.controller().homeViewport(),
    undefined,
    "before rendering, IO owns the first intersection",
  )
  assert.equal(early.frames.size, 0)
  const f = fixture()
  f.win.scrollY = 100 // initial restoration is not necessarily y=0
  f.start()
  f.frame()
  f.frame()
  f.scroll(200)
  f.scroll(3000)
  f.win.innerHeight = 950
  f.win.dispatchEvent(new Event("resize"))
  f.doc.visibilityState = "hidden"
  f.scroll(8000)
  const ranges = f.controller().homeViewport()
  assert.deepEqual(ranges, [
    { top: 100, bottom: 1100 },
    { top: 3000, bottom: 3950 },
  ])
  f.doc.visibilityState = "visible"
  f.scroll(50)
  assert.equal(ranges?.length, 2)
  assert.equal(f.controller().homeViewport(), undefined)
  const late = fixture()
  late.start()
  late.paint.push({ name: "first-contentful-paint" })
  assert.deepEqual(late.controller().homeViewport(), [{ top: 0, bottom: 900 }])
})

test("reading pages and cold reduced about pages do not arm or load an entrance", () => {
  for (const slug of ["notes/sample", "about/index"]) {
    const f = fixture(slug)
    f.reduced.matches = slug === "about/index"
    f.start()
    assert.equal(f.prepare(), undefined)
    assert.deepEqual(f.root.dataset, {})
    assert.equal(f.timers.size + f.frames.size, 0)
  }
})

test("about: bounded admission and watchdog restore author styles and reject late callbacks", () => {
  for (const caseName of [
    "missing module",
    "late library",
    "delayed timer",
    "never handed off",
    "stalled animation",
  ]) {
    const f = fixture("about/index")
    const [a] = f.elements
    a.style.setProperty("opacity", "0.94", "important")
    f.start()
    assert.equal(f.root.dataset.komeiStartupCold, "about/index")
    if (caseName === "missing module") f.tick(60_000)
    const run = f.prepare()
    if (caseName === "missing module") assert.equal(run, undefined)
    else {
      assert.ok(run)
      assert.equal(a.dataset.komeiEntry, "")
      if (caseName === "late library" || caseName === "delayed timer") {
        f.tick(60_000, caseName !== "delayed timer")
        assert.equal(run.claim(), false)
      } else {
        assert.ok(run.claim())
        run.onReveal(() => a.style.removeProperty("opacity"))
        a.style.setProperty("opacity", "0")
        if (caseName === "stalled animation") run.handoff()
        f.tick(60_000)
      }
      assert.equal(run.valid(), false)
      run.handoff(() => assert.fail("released owner revived"))
    }
    assert.equal(a.dataset.komeiEntry, undefined)
    assert.deepEqual(a.properties.get("opacity"), ["0.94", "important"])
    assert.equal(f.root.dataset.komeiStartupCold, undefined)
    assert.equal(f.timers.size, 0)
  }
})

test("about: handoff is once, completion is per-target, cleanup and navigation cannot replay retained targets", () => {
  const f = fixture("notes/example")
  f.start()
  f.prepare()
  const run = f.navigate("about/index")!
  assert.ok(run.claim())
  let starts = 0,
    cleanups = 0
  run.onReveal(() => cleanups++)
  run.handoff(() => starts++)
  run.handoff(() => starts++)
  assert.equal(starts, 1)
  run.complete([run.targets[0]])
  assert.equal(run.valid(), true)
  run.complete(run.targets)
  assert.equal(cleanups, 1)
  assert.equal(run.valid(), false)
  assert.equal(f.prepare(), undefined)
  f.navigate("notes/example", false)
  assert.equal(f.navigate("about/index", false), undefined)
  f.navigate("index")
  assert.ok(f.navigate("about/index")?.valid())
})

test("about: focus, escape, disposal, invalid routes and stale containers restore visibility", () => {
  for (const reason of [
    "focusin",
    "Escape",
    "prenav",
    "pagehide",
    "persisted",
    "motion",
    "path",
    "container",
  ]) {
    const f = fixture("about/index")
    f.start()
    const run = f.prepare()!
    assert.ok(run.claim())
    f.doc.dispatchEvent(new Event("wheel"))
    f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "j" }))
    assert.equal(run.valid(), true)
    if (reason === "focusin") {
      f.elements[0].contains = () => true
      f.doc.dispatchEvent(new Event(reason))
    }
    if (reason === "Escape")
      f.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: reason }))
    if (reason === "prenav") f.doc.dispatchEvent(new Event(reason))
    if (reason === "pagehide") f.win.dispatchEvent(new Event(reason))
    if (reason === "persisted")
      f.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    if (reason === "motion") {
      f.reduced.matches = true
      f.reduced.dispatchEvent(new Event("change"))
    }
    if (reason === "path") f.win.location.search = "?next"
    if (reason === "container") f.container.isConnected = false
    assert.equal(run.valid(), false, reason)
    run.handoff(() => assert.fail("stale route started"))
    assert.equal(
      f.elements.every((e) => e.dataset.komeiEntry === undefined),
      true,
    )
    assert.equal(f.timers.size, 0)
  }
})

test("about: discovery failure releases the cold CSS gate", () => {
  const f = fixture("about/index")
  f.start()
  f.doc.querySelectorAll = () => {
    throw new Error("injected discovery failure")
  }
  assert.equal(f.prepare(), undefined)
  assert.equal(f.root.dataset.komeiStartupCold, undefined)
  assert.equal(f.timers.size, 0)
})
