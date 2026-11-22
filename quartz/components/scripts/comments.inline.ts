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
  const giscusContainer = document.querySelector<GiscusElement>(".page-footer .giscus[data-repo]")
  // client.js replaces the loader with its iframe. Both stages are already mounted.
  if (!giscusContainer || giscusContainer.querySelector("script, iframe.giscus-frame")) return

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
  const onFrameLoad = (event: Event) => {
    // A theme change above the fold can precede the lazy iframe's message listener.
    if (event.target instanceof HTMLIFrameElement) syncFrameTheme()
  }

  giscusContainer.addEventListener("load", onFrameLoad, true)
  giscusContainer.appendChild(giscusScript)

  document.addEventListener("themechange", changeTheme)
  window.addCleanup(() => {
    document.removeEventListener("themechange", changeTheme)
    giscusContainer.removeEventListener("load", onFrameLoad, true)
    giscusContainer.replaceChildren()
  })
})
