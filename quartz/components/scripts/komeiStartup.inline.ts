import { installKomeiStartup, type StartupWindow } from "../../util/komeiStartup"
;(() => {
  try {
    installKomeiStartup(
      window,
      document,
      document.currentScript?.getAttribute("data-startup-slug") ?? "",
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
    }
  }
})()
