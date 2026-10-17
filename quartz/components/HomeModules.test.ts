import assert from "node:assert/strict"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { build } from "esbuild"

// Read the actual component resource, without exporting a new production API or writing a bundle.
const bundle = await build({
  stdin: {
    contents:
      'import HomeModules from "./HomeModules"; export const script = HomeModules().afterDOMLoaded',
    resolveDir: import.meta.dirname,
    loader: "ts",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "preact",
  plugins: [
    {
      name: "resolve-external-modules",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }))
      },
    },
  ],
})
const { script } = (await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
)) as { script: string }
assert.equal(typeof script, "string")

class ElementStub extends EventTarget {
  attributes = new Map<string, string>()
  classes = new Set<string>()
  children: ElementStub[] = []
  parentElement?: ElementStub
  textContent = ""
  disabled = false
  value = "0"
  src = ""
  alt = ""
  nativeScrollCalls = 0
  properties = new Map<string, string>()
  style = { setProperty: (key: string, value: string) => this.properties.set(key, value) }
  classList = {
    add: (key: string) => this.classes.add(key),
    remove: (key: string) => this.classes.delete(key),
    toggle: (key: string, force: boolean) =>
      force ? this.classes.add(key) : this.classes.delete(key),
  }
  rect = () => ({ top: 0, bottom: 0 })
  constructor(public tagName = "DIV") {
    super()
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value)
  }
  getAttribute(key: string) {
    return this.attributes.get(key) ?? null
  }
  removeAttribute(key: string) {
    this.attributes.delete(key)
    if (key === "src") this.src = ""
  }
  appendChild(child: ElementStub) {
    this.children.push(child)
    child.parentElement = this
  }
  replaceChildren() {
    this.children = []
  }
  closest(tag: string): ElementStub | null {
    if (this.tagName.toLowerCase() === tag) return this
    return this.parentElement?.closest(tag) ?? null
  }
  contains(child: ElementStub): boolean {
    return child === this || (child.parentElement ? this.contains(child.parentElement) : false)
  }
  getBoundingClientRect() {
    return this.rect()
  }
  scrollIntoView() {
    this.nativeScrollCalls++
  }
}

class ButtonStub extends ElementStub {}
class AnchorStub extends ElementStub {
  get href() {
    return this.getAttribute("href") ?? ""
  }
  set href(value: string) {
    this.setAttribute("href", value)
  }
}
class ImageStub extends ElementStub {}
class InputStub extends ElementStub {}
class AudioStub extends ElementStub {
  paused = true
  currentTime = 0
  duration = Number.NaN
  readyState = 0
  pauseCalls = 0
  loadCalls = 0
  playCalls = 0
  pause() {
    this.paused = true
    this.pauseCalls++
  }
  load() {
    this.loadCalls++
  }
  play() {
    this.paused = false
    this.playCalls++
    return Promise.resolve()
  }
}

class PlaylistStub extends ElementStub {
  clientHeight = 100
  scrollHeight = 500
  clientTop = 2
  scrollWrites: number[] = []
  offset = 0
  get scrollTop() {
    return this.offset
  }
  set scrollTop(value: number) {
    // Deliberately do not clamp here: the production script must supply legal values.
    this.scrollWrites.push(value)
    this.offset = value
  }
}

function fixture(viewportY = 0, initialScroll = 0, active = 1) {
  const cleanups: (() => void)[] = []
  const timers = new Map<number, () => void>()
  let timer = 0
  const windowScrollCalls: unknown[][] = []
  const win = Object.assign(new EventTarget(), {
    location: new URL("https://fixture.invalid/"),
    scrollY: viewportY,
    scrollTo(...args: unknown[]) {
      windowScrollCalls.push(args)
    },
    addCleanup(fn: () => void) {
      cleanups.push(fn)
    },
    setTimeout(fn: () => void) {
      timers.set(++timer, fn)
      return timer
    },
    clearTimeout(id: number) {
      timers.delete(id)
    },
  })

  function makePlayer() {
    const playlist = new PlaylistStub("OL")
    playlist.offset = initialScroll
    playlist.rect = () => ({ top: 1800 - win.scrollY, bottom: 1904 - win.scrollY })
    const audio = new AudioStub("AUDIO")
    const slots = new Map<string, ElementStub>([
      ["audio", audio],
      ["play", new ButtonStub("BUTTON")],
      ["cover-link", new AnchorStub("A")],
      ["cover", new ImageStub("IMG")],
      ["seek", new InputStub("INPUT")],
    ])
    for (const slot of [
      "play-icon",
      "play-label",
      "cover-title",
      "cover-subtitle",
      "current-title",
      "current-artist",
      "current-meta",
      "lyrics",
      "tags",
      "state",
      "time",
      "progress",
      "list-progress",
    ])
      slots.set(slot, new ElementStub())
    const rows = [new ElementStub("LI"), new ElementStub("LI")]
    const offsets = [0, 180]
    const heights = [40, 40]
    const buttons = rows.map((row, index) => {
      playlist.appendChild(row)
      row.rect = () => {
        const top = playlist.rect().top + playlist.clientTop + offsets[index] - playlist.scrollTop
        return { top, bottom: top + heights[index] }
      }
      const button = new ButtonStub("BUTTON")
      row.appendChild(button)
      for (const [key, value] of Object.entries({
        "source-kind": "network",
        src: `https://media.invalid/${index}.mp3`,
        title: `Public track ${index}`,
        artist: `Artist ${index}`,
        album: `Album ${index}`,
        mood: "calm",
        lyrics: `Public lyrics ${index}`,
        cover: `/${index}.png`,
        link: "/notes/example",
        "link-internal": "true",
        duration: "03:00",
        tags: "calm|instrumental",
      }))
        button.setAttribute(`data-${key}`, value)
      button.setAttribute("aria-pressed", String(index === active))
      return button
    })
    const player = Object.assign(new ElementStub(), {
      querySelector(selector: string) {
        if (selector === ".komei-music-player__playlist") return playlist
        const key = selector.slice("[data-komei-music-".length, -1)
        return slots.get(key) ?? null
      },
      querySelectorAll: () => buttons,
    })
    return { player, playlist, audio, slots, rows, buttons, offsets, heights }
  }
  let mounted = makePlayer()
  const doc = Object.assign(new EventTarget(), {
    querySelectorAll: () => [mounted.player],
    createElement: (tag: string) => new ElementStub(tag.toUpperCase()),
  })
  runInNewContext(script, {
    window: win,
    document: doc,
    URL,
    console,
    HTMLElement: ElementStub,
    HTMLButtonElement: ButtonStub,
    HTMLAudioElement: AudioStub,
    HTMLAnchorElement: AnchorStub,
    HTMLImageElement: ImageStub,
    HTMLInputElement: InputStub,
    HTMLMediaElement: { HAVE_NOTHING: 0, HAVE_CURRENT_DATA: 2 },
  })
  const nav = () => doc.dispatchEvent(new Event("nav"))
  const flushTimers = () => {
    for (const [id, fn] of timers) {
      timers.delete(id)
      fn()
    }
  }
  return {
    win,
    cleanups,
    windowScrollCalls,
    nav,
    flushTimers,
    get mounted() {
      return mounted
    },
    replace() {
      mounted = makePlayer()
      return mounted
    },
    cleanup() {
      for (const fn of cleanups.splice(0)) fn()
      flushTimers()
    },
  }
}

function assertViewportUntouched(f: ReturnType<typeof fixture>, y: number) {
  assert.equal(f.win.scrollY, y)
  assert.equal(f.windowScrollCalls.length, 0)
  assert.equal(
    f.mounted.rows.reduce((sum, row) => sum + row.nativeScrollCalls, 0),
    0,
  )
}

test("music initialization preserves the viewport and selected-track UI without revealing the list", async (t) => {
  for (const y of [0, 1750])
    await t.test(`viewport y=${y}`, () => {
      const f = fixture(y, 10)
      f.nav()
      assertViewportUntouched(f, y)
      const p = f.mounted
      assert.equal(p.playlist.scrollTop, 10)
      assert.deepEqual(p.playlist.scrollWrites, [])
      assert.equal(p.buttons[1].getAttribute("aria-pressed"), "true")
      assert.ok(p.rows[1].classes.has("is-active"))
      assert.equal(p.slots.get("current-title")!.textContent, "Public track 1")
      assert.equal(p.slots.get("current-artist")!.textContent, "Artist 1")
      assert.equal(p.slots.get("cover-title")!.textContent, "Public track 1")
      assert.equal(p.slots.get("cover")!.src, "/1.png")
      assert.equal(p.slots.get("cover-link")!.getAttribute("href"), "/notes/example")
      assert.deepEqual(
        p.slots.get("tags")!.children.map((n) => n.textContent),
        ["calm", "instrumental"],
      )
      assert.equal(p.slots.get("state")!.textContent, "待播放")
      assert.equal(p.audio.src, "https://media.invalid/1.mp3")
      assert.equal(p.audio.pauseCalls, 1)
      assert.equal(p.audio.loadCalls, 1)
      assert.equal(p.audio.playCalls, 0)
      f.cleanup()
    })
})

test("user selection reveals only the playlist by minimum distance and clamps both edges", async (t) => {
  const cases = [
    { name: "already visible", initial: 50, top: 70, height: 20, expected: 50, writes: 0 },
    { name: "below", initial: 40, top: 170, height: 40, expected: 110, writes: 1 },
    { name: "above", initial: 150, top: 40, height: 30, expected: 40, writes: 1 },
    { name: "upper clamp", initial: 30, top: -20, height: 30, expected: 0, writes: 1 },
    { name: "lower clamp", initial: 30, top: 490, height: 40, expected: 400, writes: 1 },
    {
      name: "no overflow",
      initial: 0,
      top: 140,
      height: 40,
      expected: 0,
      writes: 0,
      scrollHeight: 80,
    },
    {
      name: "hidden list",
      initial: 0,
      top: 140,
      height: 40,
      expected: 0,
      writes: 0,
      clientHeight: 0,
    },
    { name: "exact visible edges", initial: 50, top: 50, height: 100, expected: 50, writes: 0 },
    {
      name: "tall row spans viewport",
      initial: 100,
      top: 70,
      height: 160,
      expected: 100,
      writes: 0,
    },
    { name: "tall row above", initial: 150, top: 0, height: 200, expected: 100, writes: 1 },
    { name: "tall row below", initial: 0, top: 50, height: 200, expected: 50, writes: 1 },
  ]
  for (const y of [0, 1750])
    for (const c of cases)
      await t.test(`${c.name}, viewport y=${y}`, () => {
        const f = fixture(y, c.initial, 0)
        const p = f.mounted
        p.offsets[1] = c.top
        p.heights[1] = c.height
        p.playlist.scrollHeight = c.scrollHeight ?? 500
        p.playlist.clientHeight = c.clientHeight ?? 100
        f.nav()
        f.flushTimers()
        p.buttons[1].dispatchEvent(new Event("click"))
        assertViewportUntouched(f, y)
        assert.equal(p.playlist.scrollTop, c.expected)
        assert.equal(p.playlist.scrollWrites.length, c.writes)
        assert.equal(p.audio.pauseCalls, 2)
        assert.equal(p.audio.loadCalls, 2)
        assert.equal(p.audio.playCalls, 0)
        assert.equal(p.slots.get("current-title")!.textContent, "Public track 1")
        f.cleanup()
      })
})

test("music initialization still falls back to the first track", () => {
  const f = fixture(0, 0, -1)
  f.nav()
  assert.equal(f.mounted.buttons[0].getAttribute("aria-pressed"), "true")
  assert.equal(f.mounted.slots.get("current-title")!.textContent, "Public track 0")
  assertViewportUntouched(f, 0)
  f.cleanup()
})

test("repeated nav stays single-bound and cleanup detaches old-player selection", () => {
  const f = fixture()
  f.nav()
  f.flushTimers()
  const old = f.mounted
  const count = f.cleanups.length
  f.nav()
  assert.equal(f.cleanups.length, count)
  assert.equal(old.audio.loadCalls, 1)
  old.buttons[0].dispatchEvent(new Event("click"))
  assert.equal(old.audio.loadCalls, 2)
  f.cleanup()
  const afterCleanup = old.audio.loadCalls
  old.buttons[1].dispatchEvent(new Event("click"))
  assert.equal(old.audio.loadCalls, afterCleanup)
  const next = f.replace()
  f.nav()
  f.nav()
  assert.equal(next.audio.loadCalls, 1)
  next.buttons[0].dispatchEvent(new Event("click"))
  assert.equal(next.audio.loadCalls, 2)
  assertViewportUntouched(f, 0)
  f.cleanup()
})
