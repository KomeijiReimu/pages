import { installKomeiStartup } from "../../util/komeiStartup"
import { watchInitialScroll } from "./scrollHistory"

watchInitialScroll(window)

// Optional Google Fonts sheets on home are fetched with non-matching screen media.
// Enable only *after* the sheet (and its imports) is loaded: no render-blocking
// fetch, even for cached sheets. Capture also works for links patched in by SPA.
document.head.addEventListener(
  "load",
  (event) => {
    const link = event.target
    if (link instanceof HTMLLinkElement && link.hasAttribute("data-komei-home-style")) {
      link.removeAttribute("data-komei-home-style")
      link.media = "all"
    }
  },
  true,
)

installKomeiStartup(
  window,
  document,
  document.currentScript?.getAttribute("data-startup-slug") ?? "",
)
