import { installKomeiStartup, type StartupWindow } from "../../util/komeiStartup"
;(() => {
  try {
    installKomeiStartup(
      window,
      document,
      document.currentScript?.getAttribute("data-startup-slug") ?? "",
      JSON.parse(document.currentScript?.getAttribute("data-startup-fonts") ?? "null") ?? undefined,
    )
  } catch {
    // A blocked or broken bootstrap must leave the default, readable document alone.
    try {
      ;(window as StartupWindow).komeiStartup?.cancel()
    } catch {
      /* Already fail-open. */
    } finally {
      document.documentElement.removeAttribute("data-komei-startup-cold")
      document.documentElement.removeAttribute("data-komei-veil")
      if (document.documentElement.dataset.komeiFontPhase === "pending")
        document.documentElement.dataset.komeiFontPhase = "fallback"
    }
  }
})()
