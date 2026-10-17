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
  const reduced = Object.assign(new EventTarget(), { matches: false })
  const root = new ElementStub()
  const body = new ElementStub()
  body.dataset.slug = slug
  let container = new ElementStub()
  let elements = [new ElementStub(), new ElementStub()]
  const doc = Object.assign(new EventTarget(), {
    documentElement: root,
    body,
    querySelector: () => container,
    querySelectorAll: () => elements,
  })
  const win = Object.assign(new EventTarget(), {
    location: { pathname, search: "" },
    performance: { now: () => now },
    matchMedia: () => reduced,
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
  return {
    root,
    body,
    win,
    doc,
    reduced,
    timers,
    start,
    prepare,
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
  assert.equal(f.timers.size, 2, "watchdogs exist before the pending marker")
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
  assert.equal(f.timers.size, 0)
  assert.equal(run.claim(), false)
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
