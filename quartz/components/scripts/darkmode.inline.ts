type KomeiTheme = "light" | "dark"

type KomeiThemeController = {
  sync: () => void
}

type KomeiThemeWindow = Window & {
  __komeiThemeController?: KomeiThemeController
}
;(() => {
  const controllerWindow = window as KomeiThemeWindow
  const existingController = controllerWindow.__komeiThemeController
  if (existingController) {
    existingController.sync()
    return
  }

  const root = document.documentElement
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  let storageAvailable = true
  let transitionTimer: number | undefined

  const isTheme = (value: string | null): value is KomeiTheme =>
    value === "light" || value === "dark"

  const readStoredTheme = (): KomeiTheme | null => {
    try {
      const storedTheme = window.localStorage.getItem("theme")
      return isTheme(storedTheme) ? storedTheme : null
    } catch {
      storageAvailable = false
      return null
    }
  }

  let userTheme: KomeiTheme | null = readStoredTheme()
  let effectiveTheme: KomeiTheme = userTheme ?? (systemThemeQuery.matches ? "dark" : "light")
  root.setAttribute("saved-theme", effectiveTheme)

  const clearThemeTransition = () => {
    window.clearTimeout(transitionTimer)
    transitionTimer = undefined
    root.classList.remove("komei-theme-is-transitioning")
  }

  const beginThemeTransition = () => {
    clearThemeTransition()
    if (reduceMotionQuery.matches) return

    root.classList.add("komei-theme-is-transitioning")
    transitionTimer = window.setTimeout(clearThemeTransition, 240)
  }

  const syncThemeButtons = () => {
    const isDark = effectiveTheme === "dark"
    for (const darkmodeButton of document.getElementsByClassName("darkmode")) {
      if (!(darkmodeButton instanceof HTMLButtonElement)) continue
      darkmodeButton.setAttribute("aria-pressed", isDark ? "true" : "false")
      darkmodeButton.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到深色模式")
      darkmodeButton.dataset.themeState = effectiveTheme
    }
  }

  const emitThemeChangeEvent = (theme: KomeiTheme) => {
    const event: CustomEventMap["themechange"] = new CustomEvent("themechange", {
      detail: { theme },
    })
    document.dispatchEvent(event)
  }

  const applyTheme = (
    nextTheme: KomeiTheme,
    { animate, emit }: { animate: boolean; emit: boolean },
  ) => {
    if (nextTheme === effectiveTheme) {
      root.setAttribute("saved-theme", effectiveTheme)
      syncThemeButtons()
      return false
    }

    if (animate) beginThemeTransition()
    else clearThemeTransition()

    effectiveTheme = nextTheme
    root.setAttribute("saved-theme", effectiveTheme)
    syncThemeButtons()
    if (emit) emitThemeChangeEvent(effectiveTheme)
    return true
  }

  const persistUserTheme = (theme: KomeiTheme) => {
    userTheme = theme
    if (!storageAvailable) return

    try {
      window.localStorage.setItem("theme", theme)
    } catch {
      storageAvailable = false
    }
  }

  const refreshStoredTheme = () => {
    if (!storageAvailable) return

    try {
      const storedTheme = window.localStorage.getItem("theme")
      userTheme = isTheme(storedTheme) ? storedTheme : null
    } catch {
      storageAvailable = false
    }
  }

  const handleThemeButtonClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest(".darkmode")
    if (!(button instanceof HTMLButtonElement)) return

    const nextTheme: KomeiTheme = effectiveTheme === "dark" ? "light" : "dark"
    persistUserTheme(nextTheme)
    applyTheme(nextTheme, { animate: true, emit: true })
  }

  const handleSystemThemeChange = (event: MediaQueryListEvent) => {
    if (userTheme !== null) return
    applyTheme(event.matches ? "dark" : "light", { animate: true, emit: true })
  }

  const handleReducedMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches) clearThemeTransition()
  }

  const syncAfterNavigation = () => {
    root.setAttribute("saved-theme", effectiveTheme)
    syncThemeButtons()
  }

  const syncAfterPageRestore = (event: PageTransitionEvent) => {
    if (!event.persisted) return
    refreshStoredTheme()
    const restoredTheme = userTheme ?? (systemThemeQuery.matches ? "dark" : "light")
    applyTheme(restoredTheme, { animate: false, emit: true })
  }

  document.addEventListener("click", handleThemeButtonClick)
  document.addEventListener("nav", syncAfterNavigation)
  systemThemeQuery.addEventListener("change", handleSystemThemeChange)
  reduceMotionQuery.addEventListener("change", handleReducedMotionChange)
  window.addEventListener("pageshow", syncAfterPageRestore)
  window.addEventListener("pagehide", clearThemeTransition)

  controllerWindow.__komeiThemeController = { sync: syncAfterNavigation }
  syncThemeButtons()
})()
