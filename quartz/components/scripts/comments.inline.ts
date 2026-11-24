type GiscusElement = Omit<HTMLElement, "dataset"> & {
  dataset: DOMStringMap & {
    repo: `${string}/${string}`
    repoId: string
    category: string
    categoryId: string
    themeUrl: string
    lightTheme: string
    darkTheme: string
    mapping: "url" | "title" | "og:title" | "specific" | "number" | "pathname"
    strict: string
    reactionsEnabled: string
    inputPosition: "top" | "bottom"
    lang: string
  }
}

document.addEventListener("nav", () => {
  const shell = document.querySelector<HTMLElement>(".page-footer .komei-comments")
  const giscusContainer = shell?.querySelector<GiscusElement>(".giscus[data-repo]")
  // client.js replaces the loader with its iframe. Both stages are already mounted.
  if (!shell || !giscusContainer || giscusContainer.querySelector("script, iframe.giscus-frame"))
    return

  const status = shell.querySelector<HTMLElement>(".komei-comments__status")!
  shell.dataset.state = "loading"
  let slowTimer: number | undefined
  const showState = (state: "slow" | "failed" | "ready") => {
    window.clearTimeout(slowTimer)
    nearReader?.disconnect()
    shell.dataset.state = state
    status.hidden = state === "ready"
    if (state !== "ready") status.textContent = status.dataset[state]!
    giscusContainer.setAttribute("aria-busy", String(state === "slow"))
  }

  // An offscreen lazy frame may quite rightly take several minutes to start.
  // Only offer the slow-path message once the reader has reached this section.
  const startSlowTimer = () => {
    slowTimer = window.setTimeout(() => showState("slow"), 10_000)
  }
  const nearReader =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            nearReader?.disconnect()
            startSlowTimer()
          }
        })
  if (nearReader) nearReader.observe(shell)
  else startSlowTimer()
  giscusContainer.setAttribute("aria-busy", "true")

  const giscusScript = document.createElement("script")
  giscusScript.src = "https://giscus.app/client.js"
  giscusScript.async = true
  giscusScript.crossOrigin = "anonymous"
  giscusScript.setAttribute("data-loading", "lazy")
  giscusScript.setAttribute("data-emit-metadata", "0")
  giscusScript.setAttribute("data-repo", giscusContainer.dataset.repo)
  giscusScript.setAttribute("data-repo-id", giscusContainer.dataset.repoId)
  giscusScript.setAttribute("data-category", giscusContainer.dataset.category)
  giscusScript.setAttribute("data-category-id", giscusContainer.dataset.categoryId)
  giscusScript.setAttribute("data-mapping", giscusContainer.dataset.mapping)
  giscusScript.setAttribute("data-strict", giscusContainer.dataset.strict)
  giscusScript.setAttribute("data-reactions-enabled", giscusContainer.dataset.reactionsEnabled)
  giscusScript.setAttribute("data-input-position", giscusContainer.dataset.inputPosition)
  giscusScript.setAttribute("data-lang", giscusContainer.dataset.lang)
  const themeUrl = (theme: string) => {
    const { themeUrl: base, lightTheme, darkTheme } = giscusContainer.dataset
    return `${base}/${theme === "dark" ? darkTheme : lightTheme}.css`
  }
  giscusScript.dataset.theme = themeUrl(
    document.documentElement.getAttribute("saved-theme") ?? "light",
  )

  const syncFrameTheme = () => {
    giscusContainer
      .querySelector<HTMLIFrameElement>("iframe.giscus-frame")
      ?.contentWindow?.postMessage(
        { giscus: { setConfig: { theme: giscusScript.dataset.theme } } },
        "https://giscus.app",
      )
  }
  const changeTheme = (event: CustomEventMap["themechange"]) => {
    giscusScript.dataset.theme = themeUrl(event.detail.theme)
    syncFrameTheme()
  }
  let frameRendered = false
  const onFrameLoad = (event: Event) => {
    // A theme change above the fold can precede the lazy iframe's message listener.
    if (event.target instanceof HTMLIFrameElement) {
      syncFrameTheme()
      if (frameRendered) showState("ready")
    }
  }
  const onFrameMessage = (event: MessageEvent) => {
    const height: unknown = event.data?.giscus?.resizeHeight
    if (
      event.origin !== "https://giscus.app" ||
      typeof height !== "number" ||
      !Number.isFinite(height) ||
      height <= 0
    )
      return
    const frame = giscusContainer.querySelector<HTMLIFrameElement>("iframe.giscus-frame")
    // A load event also fires for blocked frames. The widget sends its own height
    // after rendering; ignore messages from previous routes or unrelated frames.
    if (frame && event.source === frame.contentWindow) {
      frameRendered = true
      if (!frame.classList.contains("giscus-frame--loading")) showState("ready")
      window.removeEventListener("message", onFrameMessage)
    }
  }
  const onScriptError = () => showState("failed")

  giscusScript.addEventListener("error", onScriptError)
  giscusContainer.addEventListener("load", onFrameLoad, true)
  window.addEventListener("message", onFrameMessage)
  giscusContainer.appendChild(giscusScript)

  document.addEventListener("themechange", changeTheme)
  window.addCleanup(() => {
    nearReader?.disconnect()
    window.clearTimeout(slowTimer)
    window.removeEventListener("message", onFrameMessage)
    giscusScript.removeEventListener("error", onScriptError)
    document.removeEventListener("themechange", changeTheme)
    giscusContainer.removeEventListener("load", onFrameLoad, true)
    giscusContainer.replaceChildren()
  })
})
