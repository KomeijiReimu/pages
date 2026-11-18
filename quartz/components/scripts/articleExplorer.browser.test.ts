import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

// Point EXPLORER_TEST_ORIGIN at a local preview with these two synthetic Markdown files.
const origin = process.env.EXPLORER_TEST_ORIGIN
const alpha = "notes/lab/alpha"
const beta = "notes/labs/beta"
const legacy = JSON.stringify([{ path: "notes/labs/index", collapsed: false }])

test(
  "article tree follows the route, not fileTree, including inside the mobile drawer",
  { skip: !origin },
  () => {
    const base = new URL(origin!)
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
    const browser = (...args: string[]) =>
      execFileSync("agent-browser", ["--session", `explorer-${process.pid}`, ...args], {
        encoding: "utf8",
        timeout: 40_000,
      }).trim()
    const run = (code: string) => browser("eval", `(() => { ${code} })()`)
    const check = (expression: string, why: string) =>
      run(`if (!(${expression})) throw new Error(${JSON.stringify(why)})`)
    const ready = (slug: string) =>
      browser("wait", "--fn", `document.querySelector('.explorer-ul a.active[data-for="${slug}"]')`)
    const tree = (slug: string, ...folders: string[]) => {
      ready(slug)
      const state = run(
        `return {active: [...document.querySelectorAll('.explorer-ul .active')].map(a => a.dataset.for), open: [...document.querySelectorAll('.folder-outer.open')].map(n => n.previousElementSibling.dataset.folderpath).sort()}`,
      )
      assert.deepEqual(JSON.parse(state), { active: [slug], open: folders.sort() })
    }
    const toggle = (path: string) => browser("click", `[data-folderpath="${path}"] .folder-icon`)
    const drawer = () => {
      browser("click", ".reading-tools__entry")
      run(
        `const tab = document.querySelector('[data-reading-view="explorer"]'); if (tab?.checkVisibility()) tab.click()`,
      )
      check(
        `document.querySelector('dialog:modal .explorer-ul') && !document.querySelector('.explorer .explorer-ul')`,
        "list was moved into the modal",
      )
    }
    const notes = "notes/index",
      lab = "notes/lab/index",
      labs = "notes/labs/index"
    try {
      browser("set", "viewport", "1280", "900")
      browser("open", new URL(alpha, base).href)
      ready(alpha)
      run(`localStorage.setItem('fileTree', ${JSON.stringify(legacy)})`)
      browser("reload")
      tree(alpha, notes, lab)
      run(`window.fileTreeCalls = []; for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[method]; Storage.prototype[method] = function(key, ...args) {
        if (this === localStorage && key === 'fileTree') window.fileTreeCalls.push(method);
        return original.call(this, key, ...args)
      }
    }`)
      toggle(labs)
      tree(alpha, notes, lab, labs)
      browser("click", `a[data-for="${beta}"]`)
      tree(beta, notes, labs)
      check(
        "window.fileTreeCalls?.length === 0",
        "SPA reused the document without touching fileTree",
      )

      browser("set", "viewport", "390", "844")
      drawer()
      toggle(lab)
      tree(beta, notes, lab, labs)
      browser("click", ".reading-drawer__close")
      drawer()
      tree(beta, notes, lab, labs)
      check("window.fileTreeCalls.length === 0", "mobile actions must not touch fileTree")
      check(`localStorage.fileTree === ${JSON.stringify(legacy)}`, "legacy bytes preserved")
      browser("reload")
      tree(beta, notes, labs)

      // Control: opt a tree into persistence and render it again with the same nav event as Quartz.
      run(
        `document.querySelector('.explorer').dataset.savestate = 'true'; document.dispatchEvent(new CustomEvent('nav', {detail:{url:${JSON.stringify(alpha)}}}))`,
      )
      tree(alpha, notes, lab, labs)
      drawer()
      toggle(labs)
      tree(alpha, notes, lab)
      check(
        `JSON.parse(localStorage.fileTree).find(x => x.path === '${labs}')?.collapsed === true`,
        "opted-in drawer saves the new state",
      )
    } finally {
      browser("close")
    }
  },
)
