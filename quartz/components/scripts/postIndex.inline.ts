type KomeiPostIndexItem = {
  href: string
  title: string
  description: string
  date: string
  tags: string[]
  noPopover: boolean
}

const batchSize = 10

function renderPostIndexCard(item: KomeiPostIndexItem) {
  const article = document.createElement("article")
  article.className = "komei-post-index-card"

  const meta = document.createElement("p")
  meta.className = "komei-post-index-card__meta"
  meta.textContent = item.date || "未标注日期"
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

function setupProgressivePostIndex() {
  const lists = document.querySelectorAll<HTMLElement>("[data-komei-progressive-posts]")
  for (const list of lists) {
    if (list.dataset.initialized === "true") continue
    list.dataset.initialized = "true"

    const grid = list.querySelector<HTMLElement>(".komei-post-index-list__grid")
    const sentinel = list.querySelector<HTMLElement>(".komei-post-index-list__sentinel")
    const button = list.querySelector<HTMLButtonElement>(".komei-post-index-list__more")
    if (!grid || !sentinel || !button) continue

    const items: KomeiPostIndexItem[] = JSON.parse(list.dataset.komeiItems ?? "[]")
    let cursor = Number(list.dataset.initialCount ?? grid.children.length)

    const appendNextBatch = () => {
      const nextItems = items.slice(cursor, cursor + batchSize)
      grid.append(...nextItems.map(renderPostIndexCard))
      cursor += nextItems.length
      const hasMore = cursor < items.length
      button.hidden = !hasMore
      sentinel.hidden = !hasMore
    }

    button.addEventListener("click", appendNextBatch)
    window.addCleanup(() => button.removeEventListener("click", appendNextBatch))

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) appendNextBatch()
      },
      { rootMargin: "420px 0px" },
    )
    observer.observe(sentinel)
    window.addCleanup(() => observer.disconnect())

    const hasMore = cursor < items.length
    button.hidden = !hasMore
    sentinel.hidden = !hasMore
  }
}

document.addEventListener("nav", setupProgressivePostIndex)
