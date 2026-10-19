import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { Script } from "node:vm"
import ts from "typescript"

// Read the actual resource literal, without exporting a production-only test API.
const source = ts.createSourceFile(
  "FloatingControls.tsx",
  await readFile(new URL("./FloatingControls.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
let resource: string | undefined
function findResource(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "backToTopScript" &&
    node.initializer &&
    ts.isNoSubstitutionTemplateLiteral(node.initializer)
  ) {
    resource = node.initializer.text
  }
  ts.forEachChild(node, findResource)
}
findResource(source)
assert.equal(typeof resource, "string")
const script = new Script(resource!, { filename: "FloatingControls.backToTopScript.js" })

function fixture({ y = 0, count = 1, reduced = false, forbidReads = false } = {}) {
  const audit: string[] = []
  const listeners = {
    window: new Map<string, ((e: unknown) => void)[]>(),
    document: new Map<string, ((e: unknown) => void)[]>(),
  }
  const frames = new Map<number, () => void>()
  const scrolls: { top: number; behavior: string }[] = []
  let sequence = 0
  let reads = 0
  let focus: Button | null = null
  const emit = (where: keyof typeof listeners, type: string, event: unknown = {}) => {
    for (const fn of listeners[where].get(type) ?? []) fn(event)
  }
  class Element {
    constructor(readonly parent?: Button) {}
    closest(selector: string): Button | null {
      if (selector !== "[data-komei-back-to-top]") return null
      return this instanceof Button ? this : (this.parent ?? null)
    }
  }
  class Button extends Element {
    readonly attrs = new Map([
      ["data-komei-back-to-top", ""],
      ["aria-hidden", "true"],
    ])
    readonly classes = new Set<string>()
    private tab = -1
    blurCount = 0
    classList = {
      add: (name: string) => {
        audit.push("write")
        this.classes.add(name)
      },
      remove: (name: string) => {
        audit.push("write")
        this.classes.delete(name)
      },
      contains: (name: string) => this.classes.has(name),
    }
    get tabIndex() {
      return this.tab
    }
    set tabIndex(value: number) {
      audit.push("write")
      this.tab = value
    }
    setAttribute(name: string, value: string) {
      audit.push("write")
      this.attrs.set(name, value)
    }
    removeAttribute(name: string) {
      audit.push("write")
      this.attrs.delete(name)
    }
    hasAttribute(name: string) {
      return this.attrs.has(name)
    }
    blur() {
      this.blurCount++
      focus = null
      emit("document", "focusout", { target: this })
    }
  }
  class MouseEvent {
    defaultPrevented = false
    constructor(
      readonly target: Element,
      readonly detail: number,
    ) {}
    preventDefault() {
      this.defaultPrevented = true
    }
  }
  let buttons = Array.from({ length: count }, () => new Button())
  const listen = (where: keyof typeof listeners) => (type: string, fn: (e: unknown) => void) => {
    const list = listeners[where].get(type) ?? []
    list.push(fn)
    listeners[where].set(type, list)
  }
  const document = {
    documentElement: { setAttribute() {} },
    querySelectorAll() {
      audit.push("query")
      return [...buttons, new Element()]
    },
    get activeElement() {
      audit.push("focus-read")
      return focus
    },
    addEventListener: listen("document"),
  }
  const window = {
    get scrollY() {
      reads++
      audit.push("position-read")
      if (forbidReads) throw new Error("empty DOM must not read scrollY")
      return y
    },
    requestAnimationFrame(fn: () => void) {
      const id = ++sequence
      frames.set(id, fn)
      return id
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id)
    },
    addEventListener: listen("window"),
    matchMedia: () => ({ matches: reduced }),
    scrollTo(options: { top: number; behavior: string }) {
      scrolls.push({ top: options.top, behavior: options.behavior })
    },
  }
  const context = { window, document, Element, HTMLButtonElement: Button, MouseEvent }
  const run = () => script.runInNewContext(context)
  return {
    run,
    emit,
    audit,
    scrolls,
    frames,
    document,
    get reads() {
      return reads
    },
    get scheduled() {
      return sequence
    },
    get buttons() {
      return buttons
    },
    get focused() {
      return focus
    },
    setY(value: number) {
      y = value
    },
    focus(button: Button) {
      focus = button
    },
    replace(count: number) {
      buttons = Array.from({ length: count }, () => new Button())
      return buttons
    },
    flush() {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((fn) => fn())
    },
    listenerCount() {
      return Object.values(listeners).reduce(
        (n, map) => n + [...map.values()].reduce((sum, list) => sum + list.length, 0),
        0,
      )
    },
    click(button = buttons[0], detail = 1, nested = false) {
      const event = new MouseEvent(nested ? new Element(button) : button, detail)
      emit("document", "click", event)
      return event
    },
  }
}

function visible(button: ReturnType<typeof fixture>["buttons"][number]) {
  return button.classList.contains("is-visible")
}

test("head empty DOM does not schedule frames or read position", () => {
  const f = fixture({ count: 0, forbidReads: true })
  f.run()
  for (const [where, type] of [
    ["document", "nav"],
    ["window", "pageshow"],
    ["window", "resize"],
    ["window", "scroll"],
  ] as const)
    f.emit(where, type)
  f.flush()
  assert.equal(f.reads, 0)
  assert.equal(f.scheduled, 0)
  assert.equal(f.scrolls.length, 0)
})

test("refresh/nav coalesce and finish reads before writing any button", () => {
  const f = fixture({ count: 2, y: 900 })
  f.run()
  const listeners = f.listenerCount()
  for (let i = 0; i < 10; i++) {
    f.run()
    f.emit("document", "nav")
    f.emit("window", "resize")
  }
  assert.equal(f.reads, 0)
  assert.equal(f.audit.includes("write"), false)
  assert.equal(f.frames.size, 1)
  assert.equal(f.scheduled, 1)
  assert.equal(f.listenerCount(), listeners)
  f.flush()
  assert.equal(f.reads, 1)
  assert.equal(f.audit.filter((v) => v === "focus-read").length, 1)
  const firstWrite = f.audit.indexOf("write")
  assert.ok(firstWrite > f.audit.indexOf("position-read"))
  assert.ok(firstWrite > f.audit.indexOf("focus-read"))
  assert.equal(
    f.audit.slice(firstWrite).some((v) => v.endsWith("-read")),
    false,
  )
  assert.ok(f.buttons.every(visible))
  assert.equal(f.scrolls.length, 0)
  f.click()
  assert.equal(f.scrolls.length, 1, "script refresh did not duplicate click handlers")
})

test("ordinary scroll and resize preserve the 420/220 hysteresis", () => {
  const f = fixture()
  f.run()
  f.flush()
  for (const [y, expected] of [
    [420, false],
    [421, true],
    [300, true],
    [221, true],
    [220, false],
    [300, false],
  ] as const) {
    f.setY(y)
    f.emit("window", "scroll")
    f.emit("window", "resize")
    f.flush()
    assert.equal(visible(f.buttons[0]), expected, `scroll ${y}`)
  }
})

test("new DOM is force-initialized at the current position, retaining refresh threshold", () => {
  const f = fixture({ y: 800 })
  f.run()
  f.flush()
  assert.equal(visible(f.buttons[0]), true)
  const next = f.replace(1)[0]
  f.setY(300)
  f.emit("document", "nav")
  assert.equal(f.frames.size, 1)
  f.flush()
  assert.equal(visible(next), false)
  assert.equal(next.attrs.get("aria-hidden"), "true")
  f.setY(950)
  f.replace(1)
  f.emit("document", "nav")
  f.flush()
  assert.equal(visible(f.buttons[0]), true)
  assert.equal(f.buttons[0].tabIndex, 0)
  assert.equal(f.scrolls.length, 0)
})

test("removing all buttons cancels pending work and later DOM rebinds", () => {
  const f = fixture({ y: 800 })
  f.run()
  f.replace(0)
  f.emit("document", "nav")
  f.emit("window", "scroll")
  assert.equal(f.frames.size, 0)
  f.flush()
  assert.equal(f.reads, 0)
  f.replace(1)
  f.emit("window", "pageshow")
  f.flush()
  assert.equal(f.reads, 1)
  assert.equal(visible(f.buttons[0]), true)
})

test("focused button waits for focusout before becoming hidden", () => {
  const f = fixture({ y: 900 })
  f.run()
  f.flush()
  const button = f.buttons[0]
  f.focus(button)
  f.setY(100)
  f.emit("window", "scroll")
  f.flush()
  assert.equal(button.hasAttribute("data-komei-hide-pending"), true)
  assert.equal(visible(button), true)
  assert.equal(button.attrs.get("aria-hidden"), "false")
  assert.equal(button.tabIndex, 0)
  const keyboard = f.click(button, 0)
  assert.equal(keyboard.defaultPrevented, true)
  assert.equal(f.focused, button)
  button.blur()
  assert.equal(visible(button), false)
  assert.equal(button.hasAttribute("data-komei-hide-pending"), false)
  assert.equal(button.attrs.get("aria-hidden"), "true")
  assert.equal(button.tabIndex, -1)
})

test("pointer activation blurs and preserves reduced-motion scroll behavior", () => {
  for (const reduced of [false, true]) {
    const f = fixture({ y: 900, reduced })
    f.run()
    f.flush()
    const button = f.buttons[0]
    f.focus(button)
    assert.equal(f.click(button, 1, true).defaultPrevented, true)
    assert.equal(button.blurCount, 1)
    assert.deepEqual(f.scrolls, [{ top: 0, behavior: reduced ? "auto" : "smooth" }])
  }
})

test("pagehide cancels a frame and pageshow recollects restored DOM without scrolling", () => {
  const f = fixture({ y: 700 })
  f.run()
  f.emit("window", "pagehide")
  assert.equal(f.frames.size, 0)
  assert.equal(f.reads, 0)
  f.replace(1)
  f.setY(1200)
  f.emit("window", "pageshow")
  f.emit("document", "nav")
  assert.equal(f.frames.size, 1)
  f.flush()
  assert.equal(f.reads, 1)
  assert.equal(visible(f.buttons[0]), true)
  assert.equal(f.scrolls.length, 0)
})
