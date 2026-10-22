import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

// Opt in against a local Quartz preview with an article whose TOC overflows an 80dvh sheet:
// DRAWER_TEST_URL=http://localhost:8090/notes/... bunx tsx --test quartz/components/scripts/readingDrawer.browser.test.ts
// Uses the already installed agent-browser CLI, not a project dependency.
const article = process.env.DRAWER_TEST_URL
// A second small article exercises SPA rather than Quartz's large-page native fallback.
const nextArticle = process.env.DRAWER_TEST_NEXT_URL
const noTocArticle = process.env.DRAWER_TEST_NO_TOC_URL
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
const open = (view: "toc" | "explorer" = "toc") => {
  browser("click", ".reading-tools__entry")
  wait('document.querySelector("dialog.reading-drawer[open]")')
  evaluate(
    `const tab=document.querySelector('.reading-drawer__tabs [data-reading-view="${view}"]'); if (tab?.checkVisibility()) tab.click()`,
  )
}
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
      'document.querySelector(".reading-tools__entry")?.checkVisibility() && document.querySelector(".toc-content")',
    )
    check('document.querySelectorAll(".reading-tools__entry").length===1', "one reading entry")
    for (const [width, height] of [
      [390, 844],
      [740, 360],
    ]) {
      await t.test(`${width}×${height}: fixed close, focus, own scrolling, background lock`, () => {
        browser("set", "viewport", String(width), String(height))
        evaluate('window.scrollTo({top:1800,behavior:"instant"})')
        wait("window.scrollY > 500")
        evaluate("window.drawerTestY = window.scrollY")
        open()
        check(
          'document.querySelector("dialog[open] .toc-content")?.checkVisibility()',
          "requested TOC view is visible",
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
          'document.querySelector(".reading-drawer__close").getBoundingClientRect().bottom <= innerHeight',
          "close stays on screen",
        )
        check(
          '(() => { const r=document.querySelector(".reading-drawer__panel").getBoundingClientRect(); return Math.abs(r.bottom-innerHeight)<=2 && r.height<=innerHeight*.8+2 && r.top>=0 && r.left>=-1 && r.right<=innerWidth+1 && document.documentElement.scrollWidth<=innerWidth })()',
          "bottom sheet fits viewport and stays within 80dvh",
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
        evaluate(`window.drawerTestDialog=document.querySelector("dialog[open]");
          window.drawerTestTop=document.body.style.top; window.drawerTestLockedY=window.scrollY;
          delete window.drawerTestNavY;
          window.drawerTestTocY=document.querySelector(".reading-drawer__body").scrollTop`)
        for (const view of ["explorer", "toc", "explorer"]) {
          browser("click", `.reading-drawer__tabs [data-reading-view=${view}]`)
          check(
            'document.querySelector("dialog[open]")===window.drawerTestDialog && window.drawerTestDialog.matches(":modal") && document.querySelectorAll("dialog[open]").length===1 && document.documentElement.classList.contains("reading-drawer-open") && document.body.style.position==="fixed" && document.body.style.top===window.drawerTestTop && Math.abs(parseFloat(document.body.style.top)+window.drawerTestY)<2 && window.scrollY===window.drawerTestLockedY',
            "switch keeps the same modal, lock and real reading position",
          )
          if (view === "toc") {
            check(
              'Math.abs(document.querySelector(".reading-drawer__body").scrollTop-window.drawerTestTocY)<2',
              "TOC retains its scroll position",
            )
          } else {
            evaluate(`const s=document.querySelector(".reading-drawer__body");
              if (window.drawerTestNavY !== undefined && Math.abs(s.scrollTop-window.drawerTestNavY)>=2) throw new Error("navigation retains its scroll position");
              s.scrollTop=80; window.drawerTestNavY=s.scrollTop`)
          }
        }
        browser("press", "Shift+Tab")
        check(
          'document.querySelector("dialog").contains(document.activeElement)',
          "reverse Tab is trapped",
        )
        browser("press", "Tab")
        check('document.querySelector("dialog").contains(document.activeElement)', "Tab is trapped")
        browser("press", "Escape")
        closed()
        check('document.activeElement.matches(".reading-tools__entry")', "restore entry focus")
        check("Math.abs(window.scrollY-window.drawerTestY)<2", "restore exact reading position")
        open()
        browser("click", ".reading-drawer__close")
        closed()
        open()
        browser("mouse", "move", String(width / 2), "5")
        browser("mouse", "down")
        browser("mouse", "up")
        closed()
      })
    }
    await t.test("TOC anchor closes and unlocks before heading navigation", () => {
      open()
      check(
        '!document.querySelector(".reading-drawer__content").classList.contains("collapsed")',
        "TOC opens even when desktop collapsed",
      )
      evaluate(
        'document.querySelector(".reading-drawer__body").scrollTop=0; document.querySelector(".reading-drawer__body a[data-for]").id="drawer-test-heading"',
      )
      const targetHash = new URL(
        browser("get", "attr", "#drawer-test-heading", "href").trim(),
        article!,
      ).hash
      browser("click", "#drawer-test-heading")
      wait(`location.hash === ${JSON.stringify(targetHash)}`)
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
      open()
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
        open()
        evaluate(
          `window.dispatchEvent(new PageTransitionEvent(${JSON.stringify(name)},{persisted:true}))`,
        )
        closed()
      }
      browser("set", "viewport", "1000", "900")
      closed()
      open()
      check(
        'document.querySelector("dialog[open] .toc-content")?.checkVisibility() && !document.querySelector(".reading-drawer__tabs [data-reading-view=explorer]")?.checkVisibility()',
        "intermediate widths expose only TOC",
      )
      browser("set", "viewport", "1280", "900")
      wait('!document.querySelector("dialog[open]")')
      closed()
      check(
        'document.querySelector(".explorer-content").closest(".explorer") && !document.querySelector(".explorer-content").inert',
        "restore usable desktop explorer",
      )
      check('document.querySelector(".toc-content").closest(".toc")', "restore desktop TOC")
      check(
        '!document.querySelector(".reading-tools__entry")?.checkVisibility()',
        "no entry on desktop",
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
      open()
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
        open("explorer")
        evaluate(
          `window.drawerSpaMarker=true; const a=[...document.querySelectorAll(".reading-drawer__body a[data-for]")].find(a=>a.pathname===${JSON.stringify(nextPath)}); if (!a) throw new Error("next article is missing from explorer"); a.id="drawer-test-next"`,
        )
        browser("click", "#drawer-test-next")
        wait(
          `location.pathname === ${JSON.stringify(nextPath)} && !document.body.classList.contains("komei-page-is-leaving")`,
        )
        check("window.drawerSpaMarker === true", "small article navigation must stay in SPA")
        closed()
        open()
        check(
          'Boolean(document.querySelector(".toc-content")) === Boolean(document.querySelector(".reading-drawer__tabs [data-reading-view=toc]")?.checkVisibility())',
          "no empty outline tab",
        )
        browser("press", "Escape")
        closed()
        browser("back")
        wait(
          `location.pathname === ${JSON.stringify(originalPath)} && document.querySelector(".reading-tools__entry")?.checkVisibility()`,
        )
        closed()
        check(
          'document.querySelectorAll(".reading-tools").length===1 && document.querySelectorAll("dialog.reading-drawer").length===1',
          "one controller after SPA back",
        )
        open()
        browser("press", "Escape")
        closed()
        check(
          '!performance.getEntriesByType("resource").some(r=>r.name.split("?")[0].endsWith("/gsap.min.js"))',
          "articles do not load GSAP",
        )
      },
    )
    await t.test(
      "pages without a TOC do not expose an empty outline control",
      { skip: !noTocArticle },
      () => {
        browser("open", noTocArticle!)
        wait('document.querySelector(".reading-tools__entry")?.checkVisibility()')
        check(
          '!document.querySelector("dialog[open]") && document.body.style.position!=="fixed"',
          "navigation to an article without a TOC clears modal state",
        )
        open("explorer")
        check(
          'document.querySelector("dialog[open] .explorer-content")?.checkVisibility() && !document.querySelector("dialog[open] .toc-content") && !document.querySelector(".reading-drawer__tabs [data-reading-view=toc]")?.checkVisibility()',
          "article without a TOC opens navigation only",
        )
        browser("press", "Escape")
        closed()
      },
    )
  } finally {
    browser("close")
  }
})
