import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"

// GLASS_NAV_TEST_URL=http://localhost:8094/ bunx tsx --test quartz/components/scripts/glassNavigation.browser.test.ts
// Opt in against a finished local preview; no URL means no browser is started.
const preview = process.env.GLASS_NAV_TEST_URL
const session = `glass-navigation-${process.pid}-${randomUUID()}`
const totalTimeout = 420_000
let deadline = 0

function browser(...args: string[]) {
  const closing = args[0] === "close"
  const remaining = closing ? 15_000 : deadline - Date.now()
  assert.ok(remaining > 0, `glass navigation suite exceeded ${totalTimeout}ms`)
  const result = spawnSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
    timeout: Math.min(closing ? 15_000 : 40_000, remaining),
    maxBuffer: 4 * 1024 * 1024,
    killSignal: "SIGKILL",
  })
  assert.ok(
    !result.error && result.status === 0,
    [
      `agent-browser ${args[0]} failed (session=${session}, status=${result.status}, signal=${result.signal})`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ]
      .filter(Boolean)
      .join("\n"),
  )
  return result.stdout
}

const helpers = `
  const require = (ok, message) => { if (!ok) throw new Error(message) }
  const one = (selector) => {
    const element = document.querySelector(selector)
    require(element instanceof HTMLElement, "missing element: " + selector)
    return element
  }
  const contains = (outer, inner) => inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
  const visible = (element) => element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})
`
const evaluate = (code: string) => browser("eval", `(async () => { ${helpers}\n${code} })()`)
const wait = (expression: string) => browser("wait", "--fn", expression)

function ready(path: string, theme: string) {
  wait(`location.pathname.replace(/\\/+$/, "") === ${JSON.stringify(path.replace(/\/+$/, ""))} &&
    document.readyState === "complete" && document.querySelector(".komei-site-header") &&
    document.documentElement.getAttribute("saved-theme") === ${JSON.stringify(theme)}`)
  evaluate(`await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true`)
}

function checkLayout(path: string, phase: string) {
  evaluate(`
    const context = ${JSON.stringify(`${path} ${phase}`)} + " " + innerWidth + "px: "
    const check = (ok, message) => require(ok, context + message)
    const header = one(".komei-site-header")
    const brand = one(".komei-site-header__brand")
    const title = one(".komei-site-header__title")
    const nav = one(".komei-top-nav__links")
    const links = [...document.querySelectorAll(".komei-top-nav__links a")]
    check(JSON.stringify(links.map(link => link.textContent.trim())) ===
      JSON.stringify(["首页", "归档", "文章", "标签", "关于"]), "five links in original order")
    const expectedPaths = ["/", "/categories", "/posts", "/tags", "/about"]
    const normalized = (value) => value.replace(/\\/+$/, "") || "/"
    for (const [index, link] of links.entries()) {
      check(link.hasAttribute("href") && new URL(link.href).origin === location.origin &&
        normalized(new URL(link.href).pathname) === expectedPaths[index], "link destination: " + link.textContent)
      check(visible(link), "hidden link: " + link.textContent)
      check(parseFloat(getComputedStyle(link).fontSize) >= 14, "navigation font must remain >=14px")
      check(link.scrollWidth <= link.clientWidth + 1, "clipped link: " + link.textContent)
      const text = document.createRange()
      text.selectNodeContents(link)
      check(text.getClientRects().length === 1, "each navigation label must remain a single line")
    }
    const current = links.filter(link => link.getAttribute("aria-current") === "page")
    const activeIndex = expectedPaths.indexOf(normalized(location.pathname))
    check(current.length === (activeIndex < 0 ? 0 : 1) &&
      (activeIndex < 0 || current[0] === links[activeIndex]), "correct aria-current page")
    const boxes = links.map(link => link.getBoundingClientRect())
    const centers = boxes.map(box => (box.top + box.bottom) / 2)
    check(Math.max(...centers) - Math.min(...centers) < 2,
      "all five links must share one row: " + JSON.stringify(boxes))
    check(boxes.every((box, index) => box.width > 0 && box.height > 0 &&
      (index === 0 || box.left >= boxes[index - 1].right - 1)), "links must not overlap or reverse order")
    check(title.textContent.trim() === "KomeijiReimu的博客" && visible(title), "complete visible brand")
    const titleStyle = getComputedStyle(title)
    check(parseFloat(titleStyle.fontSize) >= 14, "brand font must remain >=14px")
    check(title.scrollWidth <= title.clientWidth + 1, "brand horizontal overflow")
    // Check horizontal glyph bounds only: font ink may extend vertically beyond the CSS line box.
    const range = document.createRange()
    range.selectNodeContents(title)
    const titleBox = title.getBoundingClientRect()
    const textBox = range.getBoundingClientRect()
    check(textBox.left >= titleBox.left - 1 && textBox.right <= titleBox.right + 1, "brand text clipped horizontally")
    const lineHeight = parseFloat(titleStyle.lineHeight)
    check(titleStyle.whiteSpace === "nowrap" || (Number.isFinite(lineHeight) &&
      titleBox.height <= lineHeight + 1), "brand must remain a single line")
    const headerBox = header.getBoundingClientRect()
    const brandBox = brand.getBoundingClientRect()
    const navBox = nav.getBoundingClientRect()
    check(boxes.every(box => contains(navBox, box)), "all five links must fit navigation container")
    check(contains(brandBox, titleBox), "brand title must fit its link")
    check(contains(headerBox, brandBox) && contains(headerBox, navBox), "brand and navigation must fit header")
    check(Math.min(brandBox.right, navBox.right) - Math.max(brandBox.left, navBox.left) <= 1 ||
      Math.min(brandBox.bottom, navBox.bottom) - Math.max(brandBox.top, navBox.top) <= 1,
      "brand may wrap to a separate row but must not overlap navigation")
    check(headerBox.width > headerBox.height && headerBox.width >= navBox.width - 1, "header must not become a vertical egg")
    check(headerBox.top >= -1 && headerBox.bottom <= innerHeight + 1 &&
      headerBox.left >= -1 && headerBox.right <= document.documentElement.clientWidth + 1,
      "showcase header must remain within viewport")
    for (const element of [header, brand, title, nav, ...links]) {
      check(element.scrollWidth <= element.clientWidth + 1, "component overflow: " + element.className)
    }
    for (const element of [document.documentElement, document.body]) {
      check(element.scrollWidth <= document.documentElement.clientWidth + 1, "page horizontal overflow")
    }
    return true
  `)
}

function checkScroll(path: string) {
  evaluate(`const maximum = document.documentElement.scrollHeight - innerHeight;
    // The checked-in changelog can be a short public stub. Add test-only scroll
    // space rather than changing real content or assuming a long private log.
    if (maximum <= 100) {
      const space = document.createElement("div");
      space.setAttribute("data-komei-test-scroll-space", "");
      space.style.height = "1200px";
      // Keep the spacer inside the sticky header's real containing block.
      one(".center").appendChild(space);
    }
    const available = document.documentElement.scrollHeight - innerHeight;
    require(available > 100, "scroll fixture unavailable: " + location.pathname);
    window.scrollTo({top: Math.min(700, available), behavior: "instant"}); return true`)
  wait(`window.scrollY > 80 && (() => {
    const box = document.querySelector(".komei-site-header")?.getBoundingClientRect()
    return box && box.top >= -1 && box.bottom <= innerHeight + 1
  })()`)
  evaluate(
    "await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true",
  )
  checkLayout(path, "scrolled")
  evaluate('window.scrollTo({top: 0, behavior: "instant"}); return true')
  wait("window.scrollY === 0")
  evaluate(
    "await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true",
  )
  checkLayout(path, "returned to top")
  evaluate('document.querySelector("[data-komei-test-scroll-space]")?.remove(); return true')
}

test(
  "glass navigation: showcase narrow containers, themes and scroll recovery",
  {
    skip: preview ? false : "set GLASS_NAV_TEST_URL to a local preview",
    timeout: totalTimeout + 20_000,
  },
  async (t) => {
    const base = new URL(preview!)
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "use a local preview")
    assert.ok(["http:", "https:"].includes(base.protocol), "use an HTTP preview")
    deadline = Date.now() + totalTimeout
    try {
      browser("open", new URL("/", base).href)
      // Each width adds a distinct pressure point; only changelog repeats for both themes.
      const cases = [
        ["/changelog/", 1440, "light"],
        ["/changelog/", 1440, "dark"],
        ["/changelog/", 390, "light"],
        ["/changelog/", 390, "dark"],
        ["/changelog/", 320, "light"],
        ["/about/", 882, "dark"],
        ["/", 1280, "light"],
      ] as const
      for (const [path, width, theme] of cases) {
        await t.test(`${path} ${width}px ${theme}: original, scrolled, restored`, () => {
          browser("set", "viewport", String(width), "900")
          browser("set", "media", theme, "reduced-motion")
          evaluate(`localStorage.setItem("theme", ${JSON.stringify(theme)}); return true`)
          browser("open", new URL(path, base).href)
          ready(path, theme)
          checkLayout(path, "original")
          checkScroll(path)
        })
      }
      await t.test("homepage navigation to about and brand return home", () => {
        browser("click", ".komei-top-nav__links a:last-child")
        ready("/about/", "light")
        checkLayout("/about/", "after navigation")
        browser("click", ".komei-site-header__brand")
        ready("/", "light")
        checkLayout("/", "after brand return")
      })
    } finally {
      // Close only this test's unique session, never --all or another worker's browser.
      browser("close")
    }
  },
)
