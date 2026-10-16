import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

// Opt in against a finished local preview; neither variable means no browser is started.
// PRESENTATION_TEST_URL=http://localhost:8094/ PRESENTATION_NOTE_PATH=/notes/... \
//   bunx tsx --test quartz/components/scripts/presentation.browser.test.ts
// Uses the installed agent-browser CLI, with no added project dependency.
const home = process.env.PRESENTATION_TEST_URL
const notePath = process.env.PRESENTATION_NOTE_PATH
const session = `presentation-${process.pid}`
const totalTimeout = 300_000
let deadline = 0

function browser(...args: string[]) {
  const closing = args[0] === "close"
  const remaining = closing ? 15_000 : deadline - Date.now()
  assert.ok(remaining > 0, `presentation browser suite exceeded ${totalTimeout}ms`)
  const result = spawnSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
    timeout: Math.min(closing ? 15_000 : 40_000, remaining),
    maxBuffer: 4 * 1024 * 1024,
    killSignal: "SIGKILL",
  })
  assert.ok(
    !result.error && result.status === 0,
    [
      `agent-browser ${args[0]} failed (status=${result.status}, signal=${result.signal})`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ]
      .filter(Boolean)
      .join("\n"),
  )
  return result.stdout
}

// Browser-side helpers fail on missing required DOM rather than silently passing empty lists.
const helpers = `
  const require = (ok, message) => { if (!ok) throw new Error(message) }
  const one = (selector) => {
    const element = document.querySelector(selector)
    require(element instanceof HTMLElement, "missing element: " + selector)
    return element
  }
  const all = (selector) => {
    const elements = [...document.querySelectorAll(selector)]
    require(elements.length > 0, "missing elements: " + selector)
    return elements
  }
  const visible = (element) => element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})
  const minimumFont = (selector, minimum) => {
    for (const element of all(selector)) {
      const actual = parseFloat(getComputedStyle(element).fontSize)
      require(actual >= minimum - 0.01, selector + ": expected >= " + minimum + "px, got " + actual)
    }
  }
  const checkNavigation = () => {
    const header = one(".komei-site-header")
    const brand = one(".komei-site-header__brand")
    const title = one(".komei-site-header__title")
    const nav = one(".komei-top-nav")
    require(title.textContent.trim() === "KomeijiReimu的博客", "exact navigation brand text")
    require(brand.getAttribute("aria-label") === "返回 KomeijiReimu的博客 首页", "brand home ARIA")
    require(nav.getAttribute("aria-label") === "KomeijiReimu的博客 主导航", "navigation ARIA")
    const links = all(".komei-top-nav__links a")
    require(JSON.stringify(links.map(link => link.textContent.trim())) ===
      JSON.stringify(["首页", "归档", "文章", "标签", "关于"]), "complete navigation order")
    require(links.every(visible), "all navigation links must be rendered")
    minimumFont(".komei-top-nav__links a, .komei-site-header__title", 14)
    require(visible(title) && title.scrollWidth <= title.clientWidth + 1, "brand text must not be truncated")
    const titleBox = title.getBoundingClientRect()
    const brandBox = brand.getBoundingClientRect()
    const navBox = nav.getBoundingClientRect()
    const headerBox = header.getBoundingClientRect()
    const textRange = document.createRange()
    textRange.selectNodeContents(title)
    const textBox = textRange.getBoundingClientRect()
    const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
    require(textBox.left >= titleBox.left - 1 && textBox.right <= titleBox.right + 1,
      "entire brand text must fit horizontally")
    // Font glyph metrics may extend beyond a CSS line box without being clipped.
    require(getComputedStyle(title).overflowY === "visible" || contains(titleBox, textBox),
      "brand glyphs must not be vertically clipped")
    require(contains(brandBox, titleBox), "brand title must fit its link")
    for (const [label, box] of [["brand", brandBox], ["navigation", navBox]]) {
      // Horizontal viewport bounds still apply after the non-sticky note header scrolls offscreen.
      require(contains(headerBox, box) && box.left >= -1 && box.right <= innerWidth + 1,
        label + " must fit header and viewport")
    }
    const overlapWidth = Math.min(brandBox.right, navBox.right) - Math.max(brandBox.left, navBox.left)
    const overlapHeight = Math.min(brandBox.bottom, navBox.bottom) - Math.max(brandBox.top, navBox.top)
    require(overlapWidth <= 1 || overlapHeight <= 1, "brand and navigation must not overlap; wrapping is allowed")
  }
  const noOverflow = () => {
    for (const element of [document.documentElement, document.body]) {
      require(element.scrollWidth <= document.documentElement.clientWidth + 1,
        element.tagName + " horizontal overflow: " + element.scrollWidth + " > " + document.documentElement.clientWidth)
    }
  }
  const noGlobalScaling = () => {
    for (const element of [document.documentElement, document.body, one("#quartz-root")]) {
      const style = getComputedStyle(element)
      require(style.zoom === "normal" || Number(style.zoom) === 1, element.tagName + " must not use zoom")
      require(style.scale === "none" || style.scale.split(" ").every(value => Number(value) === 1),
        element.tagName + " must not use global scale")
      if (style.transform !== "none") {
        const matrix = new DOMMatrixReadOnly(style.transform)
        require(matrix.is2D && Math.abs(matrix.a - 1) < 0.001 && Math.abs(matrix.d - 1) < 0.001 &&
          Math.abs(matrix.b) < 0.001 && Math.abs(matrix.c) < 0.001, element.tagName + " must not use global transform scaling")
      }
    }
    for (const element of [document.documentElement, document.body]) {
      require(getComputedStyle(element).fontSize === "16px", element.tagName + " base font must stay 16px")
    }
  }
`

const evaluate = (code: string) => browser("eval", `(async () => { ${helpers}\n${code} })()`)
const wait = (expression: string) => browser("wait", "--fn", expression)

function ready() {
  wait('document.readyState === "complete" && document.querySelector(".komei-site-header")')
  evaluate("await document.fonts.ready; return true")
}

function readyProfile() {
  ready()
  // Wait for the real entry tween to finish, not a fixed sleep or an early pre-GSAP opacity=1.
  wait(`(() => {
    const card = document.querySelector(".komei-profile-card")
    const animationsReady = matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (window.gsap && !window.gsap.isTweening(card))
    return card && animationsReady && getComputedStyle(card).opacity === "1" &&
      getComputedStyle(card).visibility === "visible" && document.fonts.status === "loaded"
  })()`)
}

function checkHome(mobile: boolean, typography: boolean) {
  evaluate(`
    noGlobalScaling()
    noOverflow()
    checkNavigation()
    const card = one(".komei-profile-card")
    const name = one(".komei-profile-card__name-group h2")
    require(name.textContent.trim() === "KomeijiReimu", "profile name must remain unchanged")
    require(one(".komei-profile-card__handle").textContent.trim() === "@brant", "profile handle must remain unchanged")
    require(one(".komei-profile-card__motto").textContent.trim() === "知识的幻想乡。", "profile motto must remain unchanged")
    require(visible(card), "profile must remain visible after entry")
    if (${mobile}) {
      require(!["absolute", "fixed"].includes(getComputedStyle(card).position), "mobile profile must remain in document flow")
      const actions = one(".komei-home-hero__actions")
      const cardBox = card.getBoundingClientRect()
      const actionBottom = Math.max(actions.getBoundingClientRect().bottom,
        ...all(".komei-home-hero__actions a").map(link => link.getBoundingClientRect().bottom))
      require(cardBox.top >= actionBottom - 1, "mobile profile must be below buttons without overlap")
      // Ancestor-level effects can wash out the whole card even when the card itself is opaque.
      for (let element = card; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        require(style.opacity === "1", "profile/ancestor must not use whole-card opacity: " + element.className)
        require(style.filter === "none", "profile/ancestor must not use a filter: " + element.className)
        require(style.backdropFilter === "none" || !style.backdropFilter.includes("blur("),
          "profile/ancestor must not use backdrop blur: " + element.className)
      }
    }
    if (${typography}) {
      minimumFont(".komei-post-card__body > p:not(.komei-post-card__meta)", 15)
      minimumFont(".komei-post-card__meta, .komei-post-card__meta time", 13)
      minimumFont(".komei-post-card__tags a", 13)
      minimumFont(".komei-post-card h3, .komei-category-card__name", 21)
      minimumFont(".komei-profile-card__name-group h2", 18)
      minimumFont(".komei-profile-card__motto", 14)
      const avatar = one(".komei-profile-card__avatar").getBoundingClientRect()
      require(avatar.width >= 52 - 0.01 && avatar.height >= 52 - 0.01, "profile avatar must be at least 52px square")
    }
    return true
  `)
}

function checkNote(desktop: boolean) {
  evaluate(`
    noOverflow()
    noGlobalScaling()
    checkNavigation()
    const article = one(".center > article")
    require(visible(article) && article.textContent.trim().length > 0, "note body must remain visible")
    require(document.querySelector(".toc-content a[data-for]"), "PRESENTATION_NOTE_PATH must contain a TOC")
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const context = canvas.getContext("2d", {willReadFrequently: true})
    require(context, "canvas color parser must be available")
    for (const element of all(".page-header, .page-header > header, .komei-site-header")) {
      const style = getComputedStyle(element)
      // Canvas parses computed rgb/rgba/color(...) instead of assuming one CSS serialization.
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = style.backgroundColor
      context.fillRect(0, 0, 1, 1)
      require(context.getImageData(0, 0, 1, 1).data[3] === 0,
        "note header background must be transparent, got " + style.backgroundColor)
      require(style.backgroundImage === "none", "note header must not add a background image")
      require(style.boxShadow === "none", "note header must not have an independent shadow")
      require(style.position !== "fixed" && !element.classList.contains("is-detached"),
        "note header must not become fixed/detached")
    }
    if (${desktop}) {
      const articleBox = article.getBoundingClientRect()
      const centerBox = one(".center").getBoundingClientRect()
      require(articleBox.width > 0 && articleBox.left >= centerBox.left - 1 &&
        articleBox.right <= centerBox.right + 1, "article must fit its actual center column")
      const style = getComputedStyle(article)
      const left = articleBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      const right = articleBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
      // Content-dependent: do not invent code/callouts or demand a hardcoded column width.
      for (const selector of [":scope > p", "pre", ".callout"]) {
        const elements = [...article.querySelectorAll(selector)].filter(visible)
        console.info("presentation width samples", selector, elements.length)
        for (const element of elements) {
          const box = element.getBoundingClientRect()
          require(box.width > 0 && box.left >= left - 1 && box.right <= right + 1,
            selector + " must fit article content width: " + JSON.stringify({left, right, x: box.left, end: box.right}))
        }
      }
    }
    const resources = performance.getEntriesByType("resource").map(entry => entry.name)
    const scripts = [...document.scripts].map(script => script.src)
    require(![...resources, ...scripts].some(url => /gsap(?:[./@_-]|%)/i.test(new URL(url, location.href).pathname)),
      "direct note load must not request the GSAP library")
    return true
  `)
}

test(
  "presentation: homepage readability and ordinary note layout",
  { skip: !home || !notePath, timeout: totalTimeout + 20_000 },
  async (t) => {
    const homeUrl = new URL(home!)
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(homeUrl.hostname), "use a local preview")
    const noteUrl = new URL(notePath!, homeUrl)
    assert.equal(noteUrl.origin, homeUrl.origin, "note must use the same local preview")
    assert.notEqual(noteUrl.pathname, homeUrl.pathname, "note must not be the homepage")
    deadline = Date.now() + totalTimeout
    try {
      for (const width of [1440, 390, 320]) {
        await t.test(`homepage ${width}px: brand, flow, overflow and typography`, () => {
          browser("set", "viewport", String(width), "1000")
          browser("set", "media", "light")
          browser("open", homeUrl.href)
          readyProfile()
          checkHome(width < 800, width !== 320)
        })
      }
      for (const width of [1440, 1280, 390]) {
        for (const theme of ["light", "dark"]) {
          await t.test(
            `direct note ${width}px ${theme}: transparent static header, body and no GSAP`,
            () => {
              browser("set", "viewport", String(width), "900")
              browser("set", "media", theme)
              // Persist before a full document navigation, not a post-load attribute-only simulation.
              evaluate(`localStorage.setItem("theme", ${JSON.stringify(theme)}); return true`)
              browser("network", "requests", "--clear")
              browser("open", noteUrl.href)
              ready()
              wait(
                `document.documentElement.getAttribute("saved-theme") === ${JSON.stringify(theme)}`,
              )
              checkNote(width >= 800)
              evaluate(`
              const maximum = document.documentElement.scrollHeight - innerHeight
              require(maximum > 80, "note fixture must be long enough to exercise header scrolling")
              window.scrollTo({top: Math.min(700, maximum), behavior: "instant"})
              return true
            `)
              wait("window.scrollY > 56")
              // Let scroll handlers and their scheduled animation frame run before inspecting state.
              evaluate(
                "await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true",
              )
              checkNote(width >= 800)
              // Legacy cache keys mention GSAP even on ordinary CSS/JS assets.
              assert.doesNotMatch(
                browser("network", "requests").replace(/\?[^\s"<>]*/g, ""),
                /gsap(?:[./@_-]|%)/i,
                "direct note network requests must not include GSAP (including failed requests)",
              )
            },
          )
        }
      }
    } finally {
      // Never close --all or touch another lane's browser session.
      browser("close")
    }
  },
)
