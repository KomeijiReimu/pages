// One modal owns both reading drawers. Moving the existing lists preserves folder
// handlers and TOC highlighting; the top layer escapes transformed route/header shells.
let disposeReadingDrawers: (() => void) | undefined
type ReadingView = "toc" | "explorer"
const readingPageState = new Map<
  string,
  { view: ReadingView; positions: Record<ReadingView, number> }
>()

function setupReadingDrawers() {
  disposeReadingDrawers?.()
  const triggers = [...document.querySelectorAll<HTMLButtonElement>("[data-reading-drawer]")]
  if (!triggers.length) return

  const tools = document.createElement("nav")
  tools.className = "reading-tools"
  tools.setAttribute("aria-label", "阅读导航")
  const entry = document.createElement("button")
  entry.type = "button"
  entry.className = "reading-tools__entry"
  entry.textContent = "目录"
  entry.setAttribute("aria-haspopup", "dialog")
  entry.setAttribute("aria-controls", "reading-drawer")
  entry.setAttribute("aria-expanded", "false")
  tools.append(entry)
  const homes = triggers.map((trigger) => {
    // OverflowList owns its final ID, so use that rather than the requested JSX ID.
    if (trigger.dataset.readingDrawer === "toc") {
      const toc = trigger.closest(".toc")
      const list = toc?.querySelector<HTMLElement>(".toc-content")
      if (list?.id) {
        trigger.setAttribute("aria-controls", list.id)
        toc?.querySelector(".toc-header")?.setAttribute("aria-controls", list.id)
      }
    }
    const home = document.createComment("reading drawer trigger")
    trigger.before(home)
    tools.append(trigger)
    return home
  })
  const dialog = document.createElement("dialog")
  dialog.id = "reading-drawer"
  dialog.className = "reading-drawer"
  dialog.setAttribute("aria-modal", "true")
  dialog.setAttribute("aria-labelledby", "reading-drawer-title")
  dialog.innerHTML = `<section class="reading-drawer__panel">
    <header class="reading-drawer__header">
      <h2 id="reading-drawer-title">目录</h2>
      <button type="button" class="reading-drawer__close" aria-label="关闭阅读导航" autofocus>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>
      </button>
    </header>
    <div class="reading-drawer__tabs" role="tablist" aria-label="目录内容">
      <button type="button" id="reading-tab-toc" role="tab" data-reading-view="toc" aria-controls="reading-drawer-body">文章大纲</button>
      <button type="button" id="reading-tab-explorer" role="tab" data-reading-view="explorer" aria-controls="reading-drawer-body">全站导航</button>
    </div>
    <div class="reading-drawer__body" id="reading-drawer-body" tabindex="0"></div>
  </section>`
  document.body.append(tools, dialog)
  const body = dialog.querySelector<HTMLElement>(".reading-drawer__body")!
  const closeButton = dialog.querySelector<HTMLButtonElement>(".reading-drawer__close")!
  const panel = dialog.querySelector<HTMLElement>(".reading-drawer__panel")!
  const mobile = window.matchMedia("(max-width: 800px)")
  const compact = window.matchMedia("(max-width: 1199px)")
  const tabs = dialog.querySelector<HTMLElement>(".reading-drawer__tabs")!
  const viewButtons = [...tabs.querySelectorAll<HTMLButtonElement>("[data-reading-view]")]
  const route = location.pathname + location.search
  const memory = readingPageState.get(route) ?? {
    view: "toc" as ReadingView,
    positions: { toc: 0, explorer: 0 },
  }
  readingPageState.set(route, memory)
  const source = (view: ReadingView) =>
    triggers.find((trigger) => trigger.dataset.readingDrawer === view)
  const available = (view: ReadingView) => {
    const trigger = source(view)
    return Boolean(
      trigger &&
      (view === "toc" || mobile.matches) &&
      !trigger.classList.contains("hide-until-loaded") &&
      document.getElementById(trigger.getAttribute("aria-controls") ?? ""),
    )
  }
  let active:
    | {
        view: ReadingView
        trigger: HTMLButtonElement
        content: HTMLElement
        home: Comment
        attributes: [string, string | null][]
        scrollPositions: [HTMLElement, number][]
      }
    | undefined
  let scroll: { x: number; y: number; styles: [HTMLElement, string, string, string][] } | undefined

  function unlock() {
    if (!scroll) return
    const saved = scroll
    scroll = undefined
    for (const [element, property, value, priority] of saved.styles) {
      if (!value) element.style.removeProperty(property)
      else element.style.setProperty(property, value, priority)
      if (!element.getAttribute("style")) element.removeAttribute("style")
    }
    document.documentElement.classList.remove("reading-drawer-open")
    window.scrollTo({ left: saved.x, top: saved.y, behavior: "instant" })
  }

  // Returning one list is deliberately separate from closing the modal. A tab
  // switch never unlocks the page, calls scrollTo or changes the focus owner.
  function returnContent() {
    const previous = active
    active = undefined
    if (previous) {
      memory.positions[previous.view] = body.scrollTop
      previous.home.replaceWith(previous.content)
      for (const [name, value] of previous.attributes) {
        if (value === null) previous.content.removeAttribute(name)
        else previous.content.setAttribute(name, value)
      }
      previous.content.dispatchEvent(new Event("reading-drawer:restore", { bubbles: true }))
      for (const [element, top] of previous.scrollPositions) element.scrollTop = top
      previous.trigger.setAttribute("aria-expanded", "false")
    }
  }

  function close(restoreFocus = true) {
    const wasOpen = dialog.open
    returnContent()
    if (dialog.open) dialog.close()
    entry.setAttribute("aria-expanded", "false")
    unlock()
    if (restoreFocus && wasOpen && entry.isConnected && entry.checkVisibility()) {
      entry.focus({ preventScroll: true })
    }
  }

  function showView(view: ReadingView) {
    if (!available(view) || active?.view === view) return
    const trigger = source(view)!
    const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "")
    if (!content) return
    returnContent()
    const home = document.createComment("reading drawer content")
    content.before(home)
    const attributes = ["class", "aria-hidden", "inert", "aria-expanded"].map(
      (name): [string, string | null] => [name, content.getAttribute(name)],
    )
    const scrollPositions: [HTMLElement, number][] = [
      content,
      ...content.querySelectorAll<HTMLElement>(".overflow"),
    ].map((element) => [element, element.scrollTop])
    active = { view, trigger, content, home, attributes, scrollPositions }
    // Tablet's TOC-only view must not erase the reader's mobile selection.
    if (mobile.matches) memory.view = view
    content.removeAttribute("inert")
    content.removeAttribute("aria-hidden")
    if (content.hasAttribute("aria-expanded")) content.setAttribute("aria-expanded", "true")
    content.classList.remove("collapsed")
    content.classList.add("reading-drawer__content")
    body.append(content)
    trigger.setAttribute("aria-expanded", "true")
    for (const button of viewButtons) {
      const selected = button.dataset.readingView === view
      button.setAttribute("aria-selected", String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    body.setAttribute("role", tabs.hidden ? "region" : "tabpanel")
    body.setAttribute(
      "aria-labelledby",
      tabs.hidden ? "reading-drawer-title" : `reading-tab-${view}`,
    )
    body.scrollTop = memory.positions[view]
  }

  function syncTools() {
    const hasToc = Boolean(source("toc"))
    const hasExplorer = Boolean(source("explorer"))
    tools.hidden = !compact.matches || (!hasToc && (!mobile.matches || !hasExplorer))
    entry.disabled = !available("toc") && !available("explorer")
    tabs.hidden = !mobile.matches || !hasToc || !hasExplorer
    for (const button of viewButtons) {
      const view = button.dataset.readingView as ReadingView
      button.disabled = !available(view)
    }
    dialog.querySelector("h2")!.textContent = tabs.hidden
      ? hasToc
        ? "文章大纲"
        : "全站导航"
      : "目录"
  }

  function open() {
    if (!compact.matches) return
    if (dialog.open) return close()
    syncTools()
    const preferred = mobile.matches ? memory.view : "toc"
    const view = available(preferred) ? preferred : available("toc") ? "toc" : "explorer"
    if (!available(view)) return
    scroll = {
      x: window.scrollX,
      y: window.scrollY,
      styles: [
        [document.documentElement, "overflow"],
        ...["position", "top", "left", "width", "overflow"].map((property) => [
          document.body,
          property,
        ]),
      ].map(([element, property]) => {
        const target = element as HTMLElement
        const name = property as string
        return [
          target,
          name,
          target.style.getPropertyValue(name),
          target.style.getPropertyPriority(name),
        ]
      }),
    }
    document.documentElement.classList.add("reading-drawer-open")
    document.documentElement.style.overflow = "hidden"
    Object.assign(document.body.style, {
      position: "fixed",
      top: `${-scroll.y}px`,
      left: `${-scroll.x}px`,
      width: "100%",
      overflow: "hidden",
    })
    showView(view)
    entry.setAttribute("aria-expanded", "true")
    dialog.showModal()
    body.scrollTop = memory.positions[view]
    closeButton.focus({ preventScroll: true })
  }

  const onTabClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-reading-view]")
    if (button && !button.disabled) showView(button.dataset.readingView as ReadingView)
  }
  const onTabKey = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    const enabled = viewButtons.filter((button) => !button.disabled)
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    event.preventDefault()
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length
    enabled[next].focus({ preventScroll: true })
    showView(enabled[next].dataset.readingView as ReadingView)
  }
  const onCancel = (event: Event) => {
    event.preventDefault()
    close()
  }
  const onBackdrop = (event: MouseEvent) => {
    if (!panel.contains(event.target as Node)) close()
  }
  // Capture before the SPA router scrolls to hashes. Never prevent normal link navigation.
  const onLink = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]")
    if (!link || !active) return
    const url = new URL(link.href)
    const samePage =
      url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.search === location.search
    close(false)
    if (
      samePage &&
      url.hash &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      let id: string
      try {
        id = decodeURIComponent(url.hash.slice(1))
      } catch {
        return
      }
      const heading = document.getElementById(id)
      if (heading) {
        const tabindex = heading.getAttribute("tabindex")
        heading.setAttribute("tabindex", "-1")
        heading.focus({ preventScroll: true })
        heading.addEventListener(
          "blur",
          () => {
            if (tabindex === null) heading.removeAttribute("tabindex")
            else heading.setAttribute("tabindex", tabindex)
          },
          { once: true },
        )
      }
    }
  }
  const onReset = () => {
    close(false)
    syncTools()
  }
  const onScrollCapture = (event: Event) => {
    if (scroll) Object.assign((event as CustomEvent).detail, { x: scroll.x, y: scroll.y })
  }
  const onClose = () => {
    if (active && !dialog.open) close()
  }
  const onCloseButton = () => close()
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      // Other site overlays register document-level Escape handlers which also
      // restore their own trigger focus, even while those overlays are closed.
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== "Tab") return
    event.stopPropagation()
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        element.checkVisibility({ visibilityProperty: true }) &&
        !element.closest("[inert]"),
    )
    const first = focusable[0] ?? closeButton
    const last = focusable.at(-1) ?? closeButton
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  entry.addEventListener("click", open)
  tabs.addEventListener("click", onTabClick)
  tabs.addEventListener("keydown", onTabKey)
  closeButton.addEventListener("click", onCloseButton)
  dialog.addEventListener("cancel", onCancel)
  dialog.addEventListener("close", onClose)
  dialog.addEventListener("click", onBackdrop)
  dialog.addEventListener("keydown", onKeyDown)
  body.addEventListener("click", onLink, true)
  mobile.addEventListener("change", onReset)
  compact.addEventListener("change", onReset)
  for (const name of ["popstate", "hashchange", "pagehide", "pageshow"])
    window.addEventListener(name, onReset)
  document.addEventListener("prenav", onReset)
  document.addEventListener("quartz:scroll-capture", onScrollCapture)
  // Explorer binds folder handlers only after its async index is ready. Keep
  // its real nodes at home until that existing readiness flag is removed.
  const readiness = new MutationObserver(syncTools)
  triggers.forEach((trigger) =>
    readiness.observe(trigger, { attributes: true, attributeFilter: ["class"] }),
  )
  syncTools()

  disposeReadingDrawers = () => {
    close(false)
    readiness.disconnect()
    triggers.forEach((trigger, i) => homes[i].replaceWith(trigger))
    tools.remove()
    dialog.remove()
    mobile.removeEventListener("change", onReset)
    compact.removeEventListener("change", onReset)
    for (const name of ["popstate", "hashchange", "pagehide", "pageshow"])
      window.removeEventListener(name, onReset)
    document.removeEventListener("prenav", onReset)
    document.removeEventListener("quartz:scroll-capture", onScrollCapture)
  }
  window.addCleanup(disposeReadingDrawers)
}

document.addEventListener("nav", setupReadingDrawers)
