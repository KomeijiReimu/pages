import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

// Set both URLs to comment-enabled notes in a local preview with a working giscus client.
const first = process.env.GISCUS_TEST_NOTE_A
const second = process.env.GISCUS_TEST_NOTE_B

test(
  "giscus follows the note across SPA navigation and keeps the frame on hash changes",
  {
    skip: !first || !second,
  },
  () => {
    const a = new URL(first!)
    const b = new URL(second!)
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(a.hostname))
    assert.equal(a.origin, b.origin)
    assert.notEqual(a.pathname, b.pathname)
    const browser = (...args: string[]) =>
      execFileSync("agent-browser", ["--session", `giscus-${process.pid}`, ...args], {
        encoding: "utf8",
        timeout: 40_000,
      }).trim()
    const ready = (note: URL) =>
      browser(
        "wait",
        "--fn",
        `(() => {
    const frames = document.querySelectorAll('iframe.giscus-frame');
    if (frames.length !== 1 || location.pathname !== ${JSON.stringify(note.pathname)}) return false;
    const params = new URL(frames[0].src).searchParams;
    const theme = document.documentElement.getAttribute('saved-theme') ?? 'light';
    return params.get('term') === location.pathname.slice(1).replace(/\\.\\w+$/, '') &&
      params.get('theme') === document.querySelector('.giscus').dataset.themeUrl + '/' + theme + '.css';
  })()`,
      )
    const check = (expression: string) =>
      assert.equal(browser("eval", expression), "true", expression)

    try {
      // Full window.load can wait on unrelated preview assets. Wait for the discussion itself.
      browser("open")
      browser("eval", `setTimeout(() => location.assign(${JSON.stringify(a.href)}), 0); true`)
      ready(a)
      browser(
        "eval",
        `window.testGiscusFrame = document.querySelector('iframe.giscus-frame'); true`,
      )
      browser(
        "eval",
        `document.dispatchEvent(new CustomEvent('nav', {detail: {url: document.body.dataset.slug}})); true`,
      )
      check(
        `document.querySelector('.giscus').childElementCount === 1 && document.querySelector('iframe.giscus-frame') === window.testGiscusFrame`,
      )
      // Observe Quartz's outgoing configuration without signing in or contacting Discussions.
      check(`(() => {
        const frame = window.testGiscusFrame, sent = [];
        Object.defineProperty(frame, 'contentWindow', {configurable: true, value: {
          postMessage: (payload, origin) => sent.push([payload.giscus.setConfig.theme, origin])
        }});
        try {
          document.dispatchEvent(new CustomEvent('themechange', {detail: {theme: 'dark'}}));
          frame.dispatchEvent(new Event('load')); // Lazy frame becomes ready after the switch.
          document.dispatchEvent(new CustomEvent('themechange', {detail: {theme: 'light'}}));
        } finally { delete frame.contentWindow; }
        const base = frame.parentElement.dataset.themeUrl;
        return JSON.stringify(sent) === JSON.stringify(['dark', 'dark', 'light'].map(theme => [base + '/' + theme + '.css', 'https://giscus.app']));
      })()`)
      browser("eval", `window.spaNavigate(new URL('#comments-test', location.href))`)
      check(
        `location.hash === '#comments-test' && document.querySelector('iframe.giscus-frame') === window.testGiscusFrame`,
      )

      browser("eval", `window.spaNavigate(new URL(${JSON.stringify(b.href)}))`)
      ready(b)
      check(`window.testGiscusFrame.isConnected === false`)
      browser("eval", "history.back(); true")
      ready(a)
      check(`window.testGiscusFrame.isConnected === false && location.hash === '#comments-test'`)
      browser("eval", "history.forward(); true")
      ready(b)
      browser("eval", `window.spaNavigate(new URL('/', location.href))`)
      check(`location.pathname === '/' && !document.querySelector('.giscus, iframe.giscus-frame')`)
      browser("eval", "history.back(); true")
      ready(b)
    } finally {
      browser("close")
    }
  },
)
