import { FullSlug, resolveRelative } from "../../util/path"
import type { SearchHit } from "../../util/search/protocol"
import { searchDocuments, resetSearchClient } from "./searchClient"

const searchDebounceMs = 140
const numSearchResults = 8
const numTagResults = 5

// Match literal text, never interpret a query as HTML or a regular expression.
function highlightedText(text: string, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  let cursor = 0
  while (cursor < text.length) {
    let start = text.length
    let length = 0
    for (const term of terms) {
      const index = lower.indexOf(term, cursor)
      if (index !== -1 && (index < start || (index === start && term.length > length))) {
        start = index
        length = term.length
      }
    }
    fragment.append(document.createTextNode(text.slice(cursor, start)))
    if (!length) break
    const span = document.createElement("span")
    span.className = "highlight"
    span.textContent = text.slice(start, start + length)
    fragment.append(span)
    cursor = start + length
  }
  return fragment
}

function queryParts(query: string) {
  if (!query.startsWith("#")) return { text: query, tag: undefined }
  const [tag, ...words] = query.slice(1).trim().split(/\s+/)
  return { text: words.join(" "), tag }
}

function setupSearch(searchElement: Element, currentSlug: FullSlug) {
  const container = searchElement.querySelector<HTMLElement>(".search-container")
  const searchButton = searchElement.querySelector<HTMLButtonElement>(".search-button")
  const searchBar = searchElement.querySelector<HTMLInputElement>(".search-bar")
  const searchLayout = searchElement.querySelector<HTMLElement>(".search-layout")
  if (!container || !searchButton || !searchBar || !searchLayout) return () => {}
  const sidebar = container.closest<HTMLElement>(".sidebar")
  const results = document.createElement("div")
  results.className = "results-container"
  results.setAttribute("aria-live", "polite")
  const preview =
    searchLayout.dataset.preview === "true" ? document.createElement("div") : undefined
  if (preview) preview.className = "preview-container"
  searchLayout.replaceChildren(results, ...(preview ? [preview] : []))

  let epoch = 0
  let querySequence = 0
  let disposed = false
  let composing = false
  let debounce: number | undefined
  let currentHover: HTMLAnchorElement | null = null
  let currentQuery = ""
  let hits = new WeakMap<HTMLAnchorElement, SearchHit>()

  function invalidate() {
    epoch++
    querySequence++
    window.clearTimeout(debounce)
  }

  function clearResults() {
    currentHover = null
    hits = new WeakMap()
    results.replaceChildren()
    preview?.replaceChildren()
    searchLayout!.setAttribute("aria-busy", "false")
  }

  function hideSearch(restoreFocus = true) {
    invalidate()
    composing = false
    container!.classList.remove("active")
    searchBar!.value = ""
    currentQuery = ""
    if (sidebar) sidebar.style.zIndex = ""
    clearResults()
    searchLayout!.classList.remove("display-results")
    if (restoreFocus) searchButton!.focus()
  }

  function showSearch(tags = false) {
    invalidate()
    clearResults()
    currentQuery = tags ? "#" : ""
    searchBar!.value = currentQuery
    if (sidebar) sidebar.style.zIndex = "1"
    container!.classList.add("active")
    searchLayout!.classList.remove("display-results")
    searchBar!.focus()
    if (tags) queueSearch()
  }

  function statusCard(title: string, description: string, retry = false) {
    clearResults()
    const card = document.createElement(retry ? "a" : "div")
    card.className = "result-card no-match"
    if (card instanceof HTMLAnchorElement) {
      card.href = "#search-retry"
      card.setAttribute("role", "button")
      card.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation() // Retry is local UI, not a hash/SPA navigation.
        resetSearchClient()
        queueSearch()
        searchBar!.focus()
      })
      card.addEventListener("keydown", (event) => {
        if (event.key === " ") {
          event.preventDefault()
          card.click()
        }
      })
    } else card.setAttribute("role", "status")
    const heading = document.createElement("h3")
    heading.textContent = title
    const message = document.createElement("p")
    message.textContent = description
    card.append(heading, message)
    results.append(card)
  }

  function selectResult(card: HTMLAnchorElement, focus = false) {
    const hit = hits.get(card)
    if (!hit || !results.contains(card) || disposed) return
    currentHover?.classList.remove("focus")
    currentHover = card
    card.classList.add("focus")
    if (focus) card.focus()
    if (!preview) return
    const inner = document.createElement("div")
    inner.className = "preview-inner"
    const title = document.createElement("h2")
    title.append(highlightedText(hit.title, queryParts(currentQuery).text))
    inner.append(title)
    for (const paragraph of hit.preview.split(/\n{2,}/).filter(Boolean)) {
      const p = document.createElement("p")
      for (const [index, line] of paragraph.split("\n").entries()) {
        if (index) p.append(document.createElement("br"))
        p.append(highlightedText(line, queryParts(currentQuery).text))
      }
      inner.append(p)
    }
    preview.replaceChildren(inner)
    preview.scrollTop = 0
  }

  function resultCard(hit: SearchHit) {
    const { text, tag } = queryParts(currentQuery)
    const card = document.createElement("a")
    card.className = "result-card"
    const url = new URL(resolveRelative(currentSlug, hit.slug as FullSlug), location.toString())
    if (hit.anchor) url.hash = encodeURIComponent(hit.anchor)
    card.href = url.toString()
    const title = document.createElement("h3")
    title.className = "card-title"
    title.append(highlightedText(hit.title, text))
    card.append(title)
    if (tag !== undefined && !text && hit.tags.length) {
      const tags = document.createElement("ul")
      tags.className = "tags"
      for (const value of hit.tags.slice(0, numTagResults)) {
        const li = document.createElement("li")
        const p = document.createElement("p")
        p.textContent = `#${value}`
        if (value.toLowerCase().includes(tag.toLowerCase())) p.className = "match-tag"
        li.append(p)
        tags.append(li)
      }
      card.append(tags)
    }
    const description = document.createElement("p")
    description.className = "card-description"
    description.append(highlightedText(hit.snippet, text))
    card.append(description)
    hits.set(card, hit)
    card.addEventListener("mouseenter", () => selectResult(card))
    card.addEventListener("focus", () => selectResult(card))
    card.addEventListener("click", (event) => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) hideSearch()
    })
    return card
  }

  async function runSearch(query: string, instance: number, sequence: number) {
    const isCurrent = () =>
      !disposed &&
      epoch === instance &&
      querySequence === sequence &&
      container!.classList.contains("active")
    try {
      const found = await searchDocuments(query, numSearchResults)
      if (!isCurrent()) return
      clearResults()
      if (!found.length) statusCard("没有找到结果。", "换个关键词再试试？")
      else {
        results.append(...found.map(resultCard))
        selectResult(results.firstElementChild as HTMLAnchorElement)
      }
    } catch {
      if (!isCurrent()) return
      statusCard("搜索暂时不可用。", "请检查网络，点击这里重试。", true)
    }
  }

  function queueSearch() {
    window.clearTimeout(debounce)
    const sequence = ++querySequence
    const instance = epoch
    currentQuery = searchBar!.value
    clearResults()
    const hasQuery = currentQuery.trim() !== ""
    searchLayout!.classList.toggle("display-results", hasQuery)
    if (!hasQuery || composing) return
    statusCard("正在搜索…", "请稍候。")
    searchLayout!.setAttribute("aria-busy", "true")
    const query = currentQuery
    debounce = window.setTimeout(() => void runSearch(query, instance, sequence), searchDebounceMs)
  }

  function shortcutHandler(event: KeyboardEvent) {
    if (event.isComposing || composing) return
    const open = container!.classList.contains("active")
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      if (open) hideSearch()
      else showSearch(event.shiftKey)
      return
    }
    if (!open) return
    if (event.key === "Escape") {
      event.preventDefault()
      hideSearch()
      return
    }
    const cards = [...results.querySelectorAll<HTMLAnchorElement>("a.result-card:not(.no-match)")]
    // The retry button keeps its native Enter/Tab behavior.
    if (!cards.length || document.activeElement instanceof HTMLButtonElement) return
    if (event.key === "Enter") {
      const active = document.activeElement
      const target = cards.includes(active as HTMLAnchorElement)
        ? (active as HTMLAnchorElement)
        : (currentHover ?? cards[0])
      if (active === target) return // native activation preserves modifier keys
      event.preventDefault()
      target.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        }),
      )
    } else if (["ArrowDown", "ArrowUp", "Tab"].includes(event.key)) {
      event.preventDefault()
      const activeIndex = cards.indexOf(document.activeElement as HTMLAnchorElement)
      const backwards = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)
      const next =
        activeIndex < 0 ? (backwards ? cards.length - 1 : 0) : activeIndex + (backwards ? -1 : 1)
      if (next < 0 || next >= cards.length) searchBar!.focus()
      else selectResult(cards[next], true)
    }
  }

  const onButton = () => showSearch()
  const onInput = () => queueSearch()
  const onCompositionStart = () => {
    composing = true
    invalidate()
    clearResults()
  }
  const onCompositionEnd = () => {
    composing = false
    queueSearch()
  }
  const onOutside = (event: MouseEvent) => {
    if (event.target === container && container.classList.contains("active")) hideSearch()
  }
  const onNavigate = () => hideSearch(false)
  searchButton.addEventListener("click", onButton)
  searchBar.addEventListener("input", onInput)
  searchBar.addEventListener("compositionstart", onCompositionStart)
  searchBar.addEventListener("compositionend", onCompositionEnd)
  container.addEventListener("click", onOutside)
  document.addEventListener("keydown", shortcutHandler)
  document.addEventListener("prenav", onNavigate)
  return () => {
    disposed = true
    hideSearch(false)
    searchButton.removeEventListener("click", onButton)
    searchBar.removeEventListener("input", onInput)
    searchBar.removeEventListener("compositionstart", onCompositionStart)
    searchBar.removeEventListener("compositionend", onCompositionEnd)
    container.removeEventListener("click", onOutside)
    document.removeEventListener("keydown", shortcutHandler)
    document.removeEventListener("prenav", onNavigate)
  }
}

let cleanups: Array<() => void> = []
function cleanupSearch() {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
}

document.addEventListener("nav", (event: CustomEventMap["nav"]) => {
  cleanupSearch()
  for (const element of document.getElementsByClassName("search")) {
    cleanups.push(setupSearch(element, event.detail.url))
  }
  window.addCleanup(cleanupSearch)
})
