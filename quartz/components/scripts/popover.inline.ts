import { computePosition, flip, inline, shift } from "@floating-ui/dom"
import { fetchCanonical } from "./util"

const p = new DOMParser()
let activeAnchor: HTMLAnchorElement | null = null
let hoverTimer: number | undefined
let activeRequest: AbortController | undefined
const popoverDelayMs = 180
const maxPreviewResponseBytes = 180_000
const maxPreviewTextLength = 520

function responseIsTooLarge(response: Response): boolean {
  const contentLength = Number(response.headers.get("Content-Length") ?? 0)
  return Number.isFinite(contentLength) && contentLength > maxPreviewResponseBytes
}

function buildLightweightPreview(html: Document, targetUrl: URL): HTMLElement | null {
  const source = html.querySelector("article") ?? html.querySelector(".popover-hint") ?? html.body
  const title =
    html.querySelector("h1.article-title")?.textContent?.trim() ??
    html.querySelector("h1")?.textContent?.trim() ??
    html.querySelector("title")?.textContent?.trim() ??
    targetUrl.pathname
  const description =
    html.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ??
    source.textContent?.replace(/\s+/g, " ").trim() ??
    ""

  if (!title && !description) return null

  const preview = document.createElement("article")
  preview.className = "popover-preview-card"

  const heading = document.createElement("h3")
  heading.textContent = title
  preview.appendChild(heading)

  if (description) {
    const paragraph = document.createElement("p")
    paragraph.textContent =
      description.length > maxPreviewTextLength
        ? `${description.slice(0, maxPreviewTextLength).trim()}…`
        : description
    preview.appendChild(paragraph)
  }

  return preview
}

async function mouseEnterHandler(
  this: HTMLAnchorElement,
  { clientX, clientY }: { clientX: number; clientY: number },
) {
  window.clearTimeout(hoverTimer)
  activeRequest?.abort()
  const link = (activeAnchor = this)
  if (link.dataset.noPopover === "true") {
    return
  }

  async function setPosition(popoverElement: HTMLElement) {
    const { x, y } = await computePosition(link, popoverElement, {
      strategy: "fixed",
      middleware: [inline({ x: clientX, y: clientY }), shift(), flip()],
    })
    Object.assign(popoverElement.style, {
      transform: `translate(${x.toFixed()}px, ${y.toFixed()}px)`,
    })
  }

  function showPopover(popoverElement: HTMLElement) {
    clearActivePopover()
    popoverElement.classList.add("active-popover")
    setPosition(popoverElement as HTMLElement)

    if (hash !== "") {
      const targetAnchor = `#popover-internal-${hash.slice(1)}`
      const heading = popoverInner.querySelector(targetAnchor) as HTMLElement | null
      if (heading) {
        // leave ~12px of buffer when scrolling to a heading
        popoverInner.scroll({ top: heading.offsetTop - 12, behavior: "instant" })
      }
    }
  }

  const targetUrl = new URL(link.href)
  const hash = decodeURIComponent(targetUrl.hash)
  targetUrl.hash = ""
  targetUrl.search = ""
  const popoverId = `popover-${link.pathname}`
  const prevPopoverElement = document.getElementById(popoverId)

  // dont refetch if there's already a popover
  if (!!document.getElementById(popoverId)) {
    showPopover(prevPopoverElement as HTMLElement)
    return
  }

  await new Promise<void>((resolve) => {
    hoverTimer = window.setTimeout(resolve, popoverDelayMs)
  })
  if (activeAnchor !== this) return

  activeRequest = new AbortController()
  const response = await fetchCanonical(targetUrl, {
    signal: activeRequest.signal,
    maxBytes: maxPreviewResponseBytes,
  }).catch((err) => {
    if ((err as DOMException).name === "AbortError") return
    console.error(err)
  })

  if (!response) return
  const [contentType] = response.headers.get("Content-Type")!.split(";")
  const [contentTypeCategory, typeInfo] = contentType.split("/")

  const popoverElement = document.createElement("div")
  popoverElement.id = popoverId
  popoverElement.classList.add("popover")
  const popoverInner = document.createElement("div")
  popoverInner.classList.add("popover-inner")
  popoverInner.dataset.contentType = contentType ?? undefined
  popoverElement.appendChild(popoverInner)

  switch (contentTypeCategory) {
    case "image":
      const img = document.createElement("img")
      img.src = targetUrl.toString()
      img.alt = targetUrl.pathname

      popoverInner.appendChild(img)
      break
    case "application":
      switch (typeInfo) {
        case "pdf":
          const pdf = document.createElement("iframe")
          pdf.src = targetUrl.toString()
          popoverInner.appendChild(pdf)
          break
        default:
          break
      }
      break
    default:
      if (responseIsTooLarge(response)) return

      const contents = await response.text()
      if (contents.length > maxPreviewResponseBytes) return

      const html = p.parseFromString(contents, "text/html")
      const preview = buildLightweightPreview(html, targetUrl)
      if (!preview) return
      popoverInner.appendChild(preview)
  }

  if (!!document.getElementById(popoverId)) {
    return
  }

  if (activeAnchor !== this) {
    return
  }

  document.body.appendChild(popoverElement)

  showPopover(popoverElement)
}

function clearActivePopover() {
  activeAnchor = null
  window.clearTimeout(hoverTimer)
  activeRequest?.abort()
  const allPopoverElements = document.querySelectorAll(".popover")
  allPopoverElements.forEach((popoverElement) => popoverElement.classList.remove("active-popover"))
}

function removeAllPopovers() {
  clearActivePopover()
  document.querySelectorAll(".popover").forEach((popoverElement) => popoverElement.remove())
}

document.addEventListener("prenav", removeAllPopovers)
document.addEventListener("click", (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest(".popover, a.internal")) return
  clearActivePopover()
})

document.addEventListener("nav", () => {
  removeAllPopovers()
  const links = [...document.querySelectorAll("a.internal")] as HTMLAnchorElement[]
  for (const link of links) {
    link.addEventListener("mouseenter", mouseEnterHandler)
    link.addEventListener("mouseleave", clearActivePopover)
    window.addCleanup(() => {
      link.removeEventListener("mouseenter", mouseEnterHandler)
      link.removeEventListener("mouseleave", clearActivePopover)
    })
  }
  window.addCleanup(removeAllPopovers)
})
