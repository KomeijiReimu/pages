type KomeiPostIndexItem = {
  href: string
  title: string
  description: string
  date: string
  year: string
  monthDay: string
  tags: string[]
  noPopover: boolean
}

const batchSize = 10

function renderPostIndexCard(item: KomeiPostIndexItem) {
  const article = document.createElement("article")
  article.className = "komei-post-index-card"

  const meta = document.createElement("p")
  meta.className = "komei-post-index-card__meta"
  meta.textContent = item.date || "无日期"
  article.appendChild(meta)

  const title = document.createElement("h3")
  const link = document.createElement("a")
  link.className = "internal"
  link.href = item.href
  if (item.noPopover) link.dataset.noPopover = "true"
  link.textContent = item.title
  title.appendChild(link)
  article.appendChild(title)

  const description = document.createElement("p")
  description.textContent = item.description
  article.appendChild(description)

  if (item.tags.length > 0) {
    const tags = document.createElement("ul")
    tags.className = "komei-post-index-card__tags"
    for (const tag of item.tags.slice(0, 4)) {
      const tagItem = document.createElement("li")
      tagItem.textContent = `#${tag}`
      tags.appendChild(tagItem)
    }
    article.appendChild(tags)
  }

  return article
}

function renderPostArchiveYear(year: string) {
  const heading = document.createElement("div")
  heading.className = "komei-post-archive-year"
  heading.dataset.komeiArchiveYear = year

  const time = document.createElement("time")
  time.textContent = year
  heading.appendChild(time)

  const node = document.createElement("span")
  node.setAttribute("aria-hidden", "true")
  heading.appendChild(node)

  return heading
}

function renderPostArchiveItem(item: KomeiPostIndexItem) {
  const article = document.createElement("article")
  article.className = "komei-post-archive-item"

  const time = document.createElement("time")
  time.className = "komei-post-archive-item__date"
  time.textContent = item.monthDay || "--"
  article.appendChild(time)

  const node = document.createElement("span")
  node.className = "komei-post-archive-item__node"
  node.setAttribute("aria-hidden", "true")
  article.appendChild(node)

  const body = document.createElement("div")
  body.className = "komei-post-archive-item__body"

  const title = document.createElement("h3")
  const link = document.createElement("a")
  link.className = "internal"
  link.href = item.href
  if (item.noPopover) link.dataset.noPopover = "true"
  link.textContent = item.title
  title.appendChild(link)
  body.appendChild(title)

  if (item.tags.length > 0) {
    const tags = document.createElement("ul")
    tags.className = "komei-post-archive-item__tags"
    for (const tag of item.tags.slice(0, 5)) {
      const tagItem = document.createElement("li")
      tagItem.textContent = `#${tag}`
      tags.appendChild(tagItem)
    }
    body.appendChild(tags)
  }

  article.appendChild(body)
  return article
}

function appendPostIndexItems(
  grid: HTMLElement,
  items: KomeiPostIndexItem[],
  mode: string,
  renderedYears: Set<string>,
) {
  const fragment = document.createDocumentFragment()

  for (const item of items) {
    if (mode === "archive") {
      if (!renderedYears.has(item.year)) {
        renderedYears.add(item.year)
        fragment.appendChild(renderPostArchiveYear(item.year))
      }
      fragment.appendChild(renderPostArchiveItem(item))
    } else {
      fragment.appendChild(renderPostIndexCard(item))
    }
  }

  grid.appendChild(fragment)
}

function setupProgressivePostIndex() {
  const lists = document.querySelectorAll<HTMLElement>("[data-komei-progressive-posts]")
  for (const list of lists) {
    if (list.dataset.initialized === "true") continue
    list.dataset.initialized = "true"

    const grid = list.querySelector<HTMLElement>(
      ".komei-post-index-list__grid, .komei-post-index-list__archive",
    )
    const sentinel = list.querySelector<HTMLElement>(".komei-post-index-list__sentinel")
    let button = list.querySelector<HTMLButtonElement>(".komei-post-index-list__more")
    if (!grid || !sentinel) continue
    if (!button) {
      button = document.createElement("button")
      button.type = "button"
      button.className = "komei-post-index-list__more"
      button.textContent = "继续显示"
      button.hidden = true
      list.appendChild(button)
    }

    const items: KomeiPostIndexItem[] = JSON.parse(list.dataset.komeiItems ?? "[]")
    const mode = list.dataset.renderMode ?? "cards"
    const renderedYears = new Set(
      Array.from(grid.querySelectorAll<HTMLElement>("[data-komei-archive-year]")).map(
        (node) => node.dataset.komeiArchiveYear ?? "",
      ),
    )
    let cursor = Number(list.dataset.initialCount ?? grid.children.length)

    const appendNextBatch = () => {
      const nextItems = items.slice(cursor, cursor + batchSize)
      appendPostIndexItems(grid, nextItems, mode, renderedYears)
      cursor += nextItems.length
      const hasMore = cursor < items.length
      sentinel.hidden = !hasMore
      if (!hasMore) button.hidden = true
    }

    button.addEventListener("click", appendNextBatch)
    window.addCleanup(() => button.removeEventListener("click", appendNextBatch))

    const hasMore = cursor < items.length
    sentinel.hidden = !hasMore
    button.hidden = true

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) appendNextBatch()
        },
        { rootMargin: "720px 0px" },
      )
      observer.observe(sentinel)
      window.addCleanup(() => observer.disconnect())
    } else {
      button.hidden = !hasMore
    }
  }
}

document.addEventListener("nav", setupProgressivePostIndex)
