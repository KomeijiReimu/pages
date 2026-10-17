import assert from "node:assert/strict"
import test from "node:test"
import { ScrollHistory } from "./scrollHistory"

function fixture(storage = new Map<string, string>()) {
  const events = new EventTarget()
  const doc = new EventTarget()
  let state: unknown = { foreign: { keep: true } }
  const location = { href: "https://fixture.test/a" }
  const win = Object.assign(events, {
    document: doc,
    location,
    scrollX: 0,
    scrollY: 2000,
    history: {
      get state() {
        return state
      },
      replaceState(s: unknown) {
        state = structuredClone(s)
      },
      pushState(s: unknown, _title: string, url: URL) {
        state = structuredClone(s)
        location.href = url.href
      },
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout,
    clearTimeout,
  })
  return {
    win: win as unknown as Window,
    raw: win,
    select(s: unknown, href: string) {
      state = structuredClone(s)
      location.href = href
    },
  }
}

test("scroll history: entries sharing a URL stay independent and foreign state survives", () => {
  const f = fixture()
  const history = new ScrollHistory(f.win)
  history.capture()
  const first = structuredClone(f.win.history.state)
  const second = history.push(new URL(f.win.location.href))
  history.activate(second)
  f.raw.scrollY = 700
  history.capture()
  assert.notEqual(second.id, first.__quartzScroll.id)
  assert.deepEqual(f.win.history.state.foreign, { keep: true })
  f.select(first, first.__quartzScroll.url)
  assert.equal(history.current().position?.y, 2000)
})

test("scroll history: popstate captures source without overwriting selected destination", () => {
  const f = fixture()
  const history = new ScrollHistory(f.win)
  history.capture()
  const a = structuredClone(f.win.history.state)
  const b = history.push(new URL("https://fixture.test/b"))
  history.activate(b)
  const bState = structuredClone(f.win.history.state)
  f.raw.scrollY = 80
  f.select(a, a.__quartzScroll.url) // The browser selects A BEFORE firing popstate.
  history.capture()
  assert.equal(f.win.history.state.__quartzScroll.position.y, 2000)
  assert.equal(history.current().position?.y, 2000)
  f.select(bState, b.url)
  assert.equal(history.current().position?.y, 80, "source lives in the per-entry memory cache")
  const reloaded = new ScrollHistory(f.win)
  assert.equal(reloaded.current().position?.y, 80, "session storage bridges documents")
})

test("scroll history: fixed-body drawer supplies its saved viewport via synchronous query", () => {
  const f = fixture()
  const history = new ScrollHistory(f.win)
  f.raw.scrollY = 0
  f.win.document.addEventListener("quartz:scroll-capture", (event) => {
    Object.assign((event as CustomEvent).detail, { x: 0, y: 2000 })
  })
  history.capture()
  assert.equal(history.current().position?.y, 2000)
})

test("scroll history: three documents merge only their capture, not stale shared-store snapshots", () => {
  const storage = new Map<string, string>()
  const a = fixture(storage)
  const historyA = new ScrollHistory(a.win)
  historyA.capture() // A=2000, then A enters bfcache.
  const b = fixture(storage)
  b.select({}, "https://fixture.test/b")
  const historyB = new ScrollHistory(b.win) // B has an old in-memory A=2000 snapshot.
  a.raw.scrollY = 2500
  historyA.capture() // A revives and saves 2500.
  const latestA = structuredClone(a.win.history.state)
  b.raw.scrollY = 80
  historyB.capture() // B revives; it must not publish its old A=2000 snapshot.
  const saved = new Map<string, { x: number; y: number }>(
    JSON.parse(storage.get("quartz-scroll-history-v1")!),
  )
  const c = fixture(storage)
  c.select(latestA, a.win.location.href)
  const reconstructedA = new ScrollHistory(c.win)
  const actual = {
    latestHistoryY: latestA.__quartzScroll.position.y,
    sessionY: saved.get(latestA.__quartzScroll.id)?.y,
    reconstructedY: reconstructedA.current().position?.y,
    stateAfterConstructorY: c.win.history.state.__quartzScroll.position.y,
  }
  assert.deepEqual(actual, {
    latestHistoryY: 2500,
    sessionY: 2500,
    reconstructedY: 2500,
    stateAfterConstructorY: 2500,
  })
  console.log("three-document shared-store evidence", actual)
})

test("scroll history: restore cancellation disconnects observer and clears timers/queued frame", () => {
  const f = fixture()
  const timers = new Map<number, { at: number; run: () => void }>()
  const frames = new Map<number, () => void>()
  let nextId = 0
  let now = 0
  let scrollCalls = 0
  const observers: ObserverStub[] = []
  class ObserverStub {
    connected = false
    constructor(private callback: () => void) {
      observers.push(this)
    }
    observe() {
      this.connected = true
    }
    disconnect() {
      this.connected = false
    }
    resize() {
      if (this.connected) this.callback()
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver")
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ObserverStub })
  Object.assign(f.raw, {
    setTimeout: (run: () => void, delay: number) => {
      const id = ++nextId
      timers.set(id, { at: now + delay, run })
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
    requestAnimationFrame: (run: () => void) => {
      const id = ++nextId
      frames.set(id, run)
      return id
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    scrollTo: (p: { left: number; top: number }) => {
      scrollCalls++
      f.raw.scrollX = p.left
      f.raw.scrollY = p.top
    },
  })
  try {
    const history = new ScrollHistory(f.win)
    history.restore(new URL(f.win.location.href), { x: 0, y: 2000 })
    assert.equal(timers.size, 5)
    observers[0].resize()
    observers[0].resize()
    assert.equal(frames.size, 1, "resize callbacks coalesce to one queued frame")
    history.cancelRestore()
    assert.equal(observers[0].connected, false)
    assert.equal(timers.size, 0)
    assert.equal(frames.size, 0)
    observers[0].resize()
    assert.equal(scrollCalls, 1, "cancelled work cannot reapply scroll")

    history.restore(new URL(f.win.location.href), { x: 0, y: 1000 })
    assert.equal(observers.filter((observer) => observer.connected).length, 1)
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      now = timer.at
      timers.delete(id)
      timer.run()
    }
    assert.equal(now, 1800)
    assert.equal(observers[1].connected, false, "finite deadline disconnects without user input")
    assert.equal(timers.size, 0)
    assert.equal(frames.size, 0)
    assert.equal(scrollCalls, 6, "one initial apply per restore plus four bounded corrections")
    assert.equal(history.current().position?.y, 1000)
    console.log("restore cancellation evidence", {
      timers: timers.size,
      frames: frames.size,
      activeObservers: observers.filter((observer) => observer.connected).length,
      scrollCalls,
      deadline: now,
    })
  } finally {
    if (original) Object.defineProperty(globalThis, "ResizeObserver", original)
    else Reflect.deleteProperty(globalThis, "ResizeObserver")
  }
})

test("scroll history: unavailable storage degrades; stale DOM captures cannot corrupt entries", () => {
  const f = fixture()
  let writes = 0
  f.raw.sessionStorage.getItem = () => {
    throw new Error("denied")
  }
  f.raw.sessionStorage.setItem = () => {
    writes++
    throw new Error("quota")
  }
  const history = new ScrollHistory(f.win)
  history.capture()
  assert.equal(
    writes,
    0,
    "a failed read cannot publish a stale snapshot, even if writing is allowed",
  )
  history.suspend()
  f.raw.scrollY = 0
  history.capture()
  assert.equal(history.current().position?.y, 2000)
  f.raw.sessionStorage.getItem = () => "[]"
  history.activate(history.current())
  f.raw.scrollY = 2100
  history.capture()
  assert.equal(writes, 1)
  assert.equal(
    history.current().position?.y,
    2100,
    "a failed write retains current in-memory capture",
  )
})

test("scroll history: storage stays bounded and malformed metadata is replaced safely", () => {
  const f = fixture()
  f.select(
    {
      foreign: 42,
      __quartzScroll: { id: "bad", url: f.win.location.href, position: { x: 0, y: NaN } },
    },
    f.win.location.href,
  )
  const history = new ScrollHistory(f.win)
  assert.notEqual(history.current().id, "bad")
  for (let i = 0; i < 100; i++) {
    history.activate(history.push(new URL(`https://fixture.test/${i}`)))
    history.capture()
  }
  const saved = JSON.parse(f.raw.sessionStorage.getItem("quartz-scroll-history-v1")!)
  assert.equal(saved.length, 80)
  assert.equal(f.win.history.state.foreign, 42)
})
