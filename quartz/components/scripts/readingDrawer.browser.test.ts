import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

// Opt in against a local Quartz preview with an article containing a TOC:
// DRAWER_TEST_URL=http://localhost:8090/notes/... bunx tsx --test quartz/components/scripts/readingDrawer.browser.test.ts
// Uses the already installed agent-browser CLI, not a project dependency.
const article = process.env.DRAWER_TEST_URL
// A second small article exercises SPA rather than Quartz's large-page native fallback.
const nextArticle = process.env.DRAWER_TEST_NEXT_URL
const session = `reading-drawers-${process.pid}`
function browser(...args: string[]) {
  const result = spawnSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
    timeout: 40_000,
  })
  assert.equal(result.status, 0, `${args[0]}: ${result.stderr || result.stdout}`)
  return result.stdout
}
const evaluate = (code: string) => browser("eval", `(() => { ${code} })()`)
const check = (expression: string, message: string) =>
  evaluate(`if (!(${expression})) throw new Error(${JSON.stringify(message)}); true`)
const wait = (expression: string) => browser("wait", "--fn", expression)
const closed = () => {
  check('!document.querySelector("dialog.reading-drawer[open]")', "drawer must close")
  check(
    '!document.documentElement.classList.contains("reading-drawer-open")',
    "lock class must clear",
  )
  check('document.body.style.position !== "fixed"', "body lock must clear")
  check(
    'document.querySelector(".center article").checkVisibility()',
    "article must remain visible",
  )
}

test("reading drawers: mobile, lifecycle, anchors and desktop", { skip: !article }, async (t) => {
  try {
    t.beforeEach(() => {
      evaluate('document.querySelector("dialog[open] .reading-drawer__close")?.click()')
      browser("set", "viewport", "390", "844")
    })
    browser("set", "viewport", "390", "844")
    browser("open", article!)
    wait(
      'document.querySelector(".reading-tools .mobile-explorer:not(.hide-until-loaded)") && document.querySelector(".mobile-toc")',
    )
    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [740, 360],
    ]) {
      await t.test(`${width}×${height}: fixed close, focus, own scrolling, background lock`, () => {
        browser("set", "viewport", String(width), String(height))
        evaluate('window.scrollTo({top:1800,behavior:"instant"})')
        wait("window.scrollY > 500")
        evaluate("window.drawerTestY = window.scrollY")
        browser("click", ".reading-tools .mobile-explorer")
        check(
          'document.querySelector(".reading-drawer__content").getAttribute("aria-expanded") === "true"',
          "opened explorer content reports expanded state",
        )
        check(
          'document.querySelector("dialog.reading-drawer").matches(":modal")',
          "use top-layer modal",
        )
        check(
          'document.activeElement.classList.contains("reading-drawer__close")',
          "focus starts on close",
        )
        check(
          'document.querySelector(".reading-drawer__close").getBoundingClientRect().bottom < innerHeight',
          "close stays on screen",
        )
        check(
          'document.querySelector(".reading-drawer__panel").getBoundingClientRect().width <= innerWidth-40',
          "leave visible backdrop",
        )
        evaluate(
          'const scroller=document.querySelector(".reading-drawer__body"); scroller.scrollTop=500',
        )
        check(
          'document.querySelector(".reading-drawer__body").scrollTop > 0',
          "drawer scrolls independently",
        )
        check(
          'document.querySelector(".reading-drawer__close").getBoundingClientRect().top >= 0',
          "scroll does not hide close",
        )
        browser("press", "Shift+Tab")
        check(
          'document.querySelector("dialog").contains(document.activeElement)',
          "reverse Tab is trapped",
        )
        browser("press", "Tab")
        check('document.querySelector("dialog").contains(document.activeElement)', "Tab is trapped")
        browser("press", "Escape")
        closed()
        check('document.activeElement.matches(".mobile-explorer")', "restore trigger focus")
        check("Math.abs(window.scrollY-window.drawerTestY)<2", "restore exact reading position")
        browser("click", ".mobile-explorer")
        evaluate('document.querySelector(".mobile-toc").click()')
        check('document.querySelector("dialog").dataset.side === "right"', "TOC opens from right")
        check('document.querySelectorAll("dialog[open]").length===1', "drawers are exclusive")
        check(
          'document.querySelector(".mobile-explorer").getAttribute("aria-expanded")==="false"',
          "switching drawers resets the other trigger",
        )
        browser("click", ".reading-drawer__close")
        closed()
        browser("click", ".mobile-explorer")
        browser("mouse", "move", String(width - 10), "140")
        browser("mouse", "down")
        browser("mouse", "up")
        closed()
      })
    }
    await t.test("TOC anchor closes and unlocks before heading navigation", () => {
      browser("click", ".mobile-toc")
      check(
        '!document.querySelector(".reading-drawer__content").classList.contains("collapsed")',
        "TOC opens even when desktop collapsed",
      )
      evaluate(
        'window.drawerTestHash=document.querySelector(".reading-drawer__body a[data-for]").hash',
      )
      browser("click", ".reading-drawer__body a[data-for]")
      wait("location.hash === window.drawerTestHash")
      wait(`(() => {
        const heading = document.getElementById(decodeURIComponent(location.hash.slice(1)))
        if (!heading) return false
        const rect = heading.getBoundingClientRect()
        return Math.abs(rect.top) <= 2 && rect.bottom > 0 && rect.top < innerHeight
      })()`)
      closed()
      check(
        "document.activeElement.id === decodeURIComponent(location.hash.slice(1))",
        "heading receives focus",
      )
    })
    await t.test("hash history, bfcache lifecycle and breakpoints clear modal state", () => {
      // Large articles may use Quartz's native history fallback, so keep the
      // expected hash in the test process rather than in the replaced Window.
      const expectedHash = new URL(browser("get", "url").trim()).hash
      browser("click", ".mobile-toc")
      browser("back")
      wait('!document.querySelector("dialog[open]")')
      closed()
      browser("forward")
      wait(`location.hash === ${JSON.stringify(expectedHash)}`)
      closed()
      browser("back")
      wait(`location.hash !== ${JSON.stringify(expectedHash)}`)
      closed()
      for (const name of ["pagehide", "pageshow"]) {
        browser("click", ".mobile-toc")
        evaluate(
          `window.dispatchEvent(new PageTransitionEvent(${JSON.stringify(name)},{persisted:true}))`,
        )
        closed()
      }
      browser("click", ".mobile-explorer")
      browser("set", "viewport", "1280", "900")
      wait('!document.querySelector("dialog[open]")')
      closed()
      check(
        'document.querySelector(".explorer-content").closest(".explorer") && !document.querySelector(".explorer-content").inert',
        "restore usable desktop explorer",
      )
      check('document.querySelector(".toc-content").closest(".toc")', "restore desktop TOC")
      check(
        'getComputedStyle(document.querySelector(".reading-tools")).display === "none"',
        "hide mobile controls on desktop",
      )
      browser("click", ".desktop-explorer")
      check(
        'document.querySelector(".explorer").classList.contains("collapsed")',
        "desktop collapse works",
      )
      browser("click", ".desktop-explorer")
      browser("click", ".toc-header")
      check(
        'document.querySelector(".toc-content").classList.contains("collapsed")',
        "desktop TOC collapse works",
      )
      browser("set", "viewport", "390", "844")
      browser("click", ".mobile-toc")
      check(
        '!document.querySelector(".reading-drawer__content").classList.contains("collapsed")',
        "mobile TOC ignores desktop collapse",
      )
      browser("press", "Escape")
    })
    await t.test(
      "SPA article links and return leave no orphan toolbars or locks",
      { skip: !nextArticle },
      () => {
        const nextPath = new URL(nextArticle!).pathname
        const originalPath = new URL(article!).pathname
        browser("click", ".mobile-explorer")
        evaluate(
          `window.drawerSpaMarker=true; const a=[...document.querySelectorAll(".reading-drawer__body a[data-for]")].find(a=>a.pathname===${JSON.stringify(nextPath)}); if (!a) throw new Error("next article is missing from explorer"); a.id="drawer-test-next"`,
        )
        browser("click", "#drawer-test-next")
        wait(
          `location.pathname === ${JSON.stringify(nextPath)} && !document.body.classList.contains("komei-page-is-leaving")`,
        )
        check("window.drawerSpaMarker === true", "small article navigation must stay in SPA")
        closed()
        check(
          'Boolean(document.querySelector(".toc-content")) === Boolean(document.querySelector(".mobile-toc"))',
          "no empty outline trigger",
        )
        browser("back")
        wait(
          `location.pathname === ${JSON.stringify(originalPath)} && document.querySelector(".reading-tools .mobile-explorer:not(.hide-until-loaded)")`,
        )
        closed()
        check(
          'document.querySelectorAll(".reading-tools").length===1 && document.querySelectorAll("dialog.reading-drawer").length===1',
          "one controller after SPA back",
        )
        browser("click", ".mobile-toc")
        browser("press", "Escape")
        closed()
        check(
          '!performance.getEntriesByType("resource").some(r=>r.name.split("?")[0].endsWith("/gsap.min.js"))',
          "articles do not load GSAP",
        )
      },
    )
    await t.test("pages without a TOC do not expose an empty outline control", () => {
      browser("open", new URL("/notes/", article!).href)
      check('!document.querySelector(".mobile-toc")', "no empty outline control on archive")
      check(
        '!document.querySelector("dialog[open]") && document.body.style.position!=="fixed"',
        "navigation to archive clears modal state",
      )
    })
  } finally {
    browser("close")
  }
})
