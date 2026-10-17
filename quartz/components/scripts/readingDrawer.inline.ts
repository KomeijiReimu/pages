// One modal owns both reading drawers. Moving the existing lists preserves folder
// handlers and TOC highlighting; the top layer escapes transformed route/header shells.
let disposeReadingDrawers: (() => void) | undefined

function setupReadingDrawers() {
  disposeReadingDrawers?.()
  const triggers = [...document.querySelectorAll<HTMLButtonElement>("[data-reading-drawer]")]
  if (!triggers.length) return

  const tools = document.createElement("nav")
  tools.className = "reading-tools"
  tools.setAttribute("aria-label", "阅读导航")
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
  dialog.className = "reading-drawer"
  dialog.setAttribute("aria-modal", "true")
  dialog.setAttribute("aria-labelledby", "reading-drawer-title")
  dialog.innerHTML = `<section class="reading-drawer__panel">
    <header class="reading-drawer__header">
      <h2 id="reading-drawer-title"></h2>
      <button type="button" class="reading-drawer__close" aria-label="关闭阅读导航" autofocus>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>
      </button>
    </header>
    <div class="reading-drawer__body"></div>
  </section>`
  document.body.append(tools, dialog)
  const body = dialog.querySelector<HTMLElement>(".reading-drawer__body")!
  const closeButton = dialog.querySelector<HTMLButtonElement>(".reading-drawer__close")!
  const panel = dialog.querySelector<HTMLElement>(".reading-drawer__panel")!
  const mobile = window.matchMedia("(max-width: 800px)")
  const compact = window.matchMedia("(max-width: 1199px)")
  let active:
    | {
        trigger: HTMLButtonElement
        content: HTMLElement
        home: Comment
        attributes: [string, string | null][]
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

  function close(restoreFocus = true) {
    const previous = active
    active = undefined
    if (dialog.open) dialog.close()
    if (previous) {
      previous.home.replaceWith(previous.content)
      for (const [name, value] of previous.attributes) {
        if (value === null) previous.content.removeAttribute(name)
        else previous.content.setAttribute(name, value)
      }
      previous.content.dispatchEvent(new Event("reading-drawer:restore", { bubbles: true }))
      previous.trigger.setAttribute("aria-expanded", "false")
    }
    unlock()
    if (restoreFocus && previous?.trigger.isConnected && previous.trigger.checkVisibility()) {
      previous.trigger.focus({ preventScroll: true })
    }
  }

  function open(trigger: HTMLButtonElement) {
    if (!compact.matches || (trigger.dataset.readingDrawer === "explorer" && !mobile.matches))
      return
    if (active?.trigger === trigger) return close()
    close(false)
    const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "")
    if (!content) return
    const home = document.createComment("reading drawer content")
    content.before(home)
    const attributes = ["class", "aria-hidden", "inert", "aria-expanded"].map(
      (name): [string, string | null] => [name, content.getAttribute(name)],
    )
    active = { trigger, content, home, attributes }
    content.removeAttribute("inert")
    content.removeAttribute("aria-hidden")
    if (content.hasAttribute("aria-expanded")) content.setAttribute("aria-expanded", "true")
    content.classList.remove("collapsed")
    content.classList.add("reading-drawer__content")
    body.append(content)
    dialog.dataset.side = trigger.dataset.readingDrawer === "toc" ? "right" : "left"
    dialog.querySelector("h2")!.textContent =
      trigger.dataset.readingDrawer === "toc" ? "文章大纲" : "全站导航"
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
    trigger.setAttribute("aria-expanded", "true")
    dialog.showModal()
    closeButton.focus({ preventScroll: true })
  }

  const onToolsClick = (event: MouseEvent) => {
    const trigger = (event.target as Element).closest<HTMLButtonElement>("[data-reading-drawer]")
    if (trigger) open(trigger)
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
  const onReset = () => close(false)
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
  tools.addEventListener("click", onToolsClick)
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

  disposeReadingDrawers = () => {
    close(false)
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
