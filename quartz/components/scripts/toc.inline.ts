const tocEntriesBySlug = new Map<string, Element[]>()
const tocVisibleBySlug = new Map<string, boolean>()

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const slug = entry.target.id
    const tocEntryElements = tocEntriesBySlug.get(slug) ?? []
    const windowHeight = entry.rootBounds?.height
    if (windowHeight && tocEntryElements.length > 0) {
      const nextVisible = entry.boundingClientRect.y < windowHeight
      if (tocVisibleBySlug.get(slug) === nextVisible) continue
      tocVisibleBySlug.set(slug, nextVisible)
      tocEntryElements.forEach((tocEntryElement) =>
        tocEntryElement.classList.toggle("in-view", nextVisible),
      )
    }
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
  tocEntriesBySlug.clear()
  tocVisibleBySlug.clear()
  document.querySelectorAll(".toc a[data-for]").forEach((entry) => {
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
