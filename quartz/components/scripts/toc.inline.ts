const tocEntriesBySlug = new Map<string, Element[]>()
const tocVisibleBySlug = new Map<string, boolean>()
let tocFrame: number | undefined
const pendingTocStates = new Map<string, boolean>()

function flushTocStates() {
  tocFrame = undefined
  for (const [slug, nextVisible] of pendingTocStates) {
    if (tocVisibleBySlug.get(slug) === nextVisible) continue
    tocVisibleBySlug.set(slug, nextVisible)
    const tocEntryElements = tocEntriesBySlug.get(slug) ?? []
    tocEntryElements.forEach((tocEntryElement) =>
      tocEntryElement.classList.toggle("in-view", nextVisible),
    )
  }
  pendingTocStates.clear()
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const slug = entry.target.id
    const windowHeight = entry.rootBounds?.height
    if (windowHeight && tocEntriesBySlug.has(slug)) {
      const nextVisible = entry.boundingClientRect.y < windowHeight
      if (tocVisibleBySlug.get(slug) === nextVisible) continue
      pendingTocStates.set(slug, nextVisible)
    }
  }
  if (pendingTocStates.size > 0 && tocFrame === undefined) {
    tocFrame = window.requestAnimationFrame(flushTocStates)
  }
})

function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc() {
  for (const toc of document.getElementsByClassName("toc")) {
    const button = toc.querySelector(".toc-header")
    const content = toc.querySelector(".toc-content")
    if (!button || !content) return
    button.addEventListener("click", toggleToc)
    window.addCleanup(() => button.removeEventListener("click", toggleToc))
  }
}

document.addEventListener("nav", () => {
  setupToc()

  // update toc entry highlighting
  observer.disconnect()
  if (tocFrame !== undefined) window.cancelAnimationFrame(tocFrame)
  tocFrame = undefined
  pendingTocStates.clear()
  tocEntriesBySlug.clear()
  tocVisibleBySlug.clear()
  const tocEntries = [...document.querySelectorAll(".toc a[data-for]")]
  if (tocEntries.length > 120 || document.body.classList.contains("komei-extreme-code-page")) {
    return
  }
  const observeLimit =
    tocEntries.length > 120 || document.body.scrollHeight > 120_000 ? 80 : Infinity
  tocEntries.slice(0, observeLimit).forEach((entry) => {
    const slug = entry.getAttribute("data-for")
    if (!slug) return
    const entries = tocEntriesBySlug.get(slug) ?? []
    entries.push(entry)
    tocEntriesBySlug.set(slug, entries)
  })
  for (const slug of tocEntriesBySlug.keys()) {
    const header = document.getElementById(slug)
    if (header) observer.observe(header)
  }
})
