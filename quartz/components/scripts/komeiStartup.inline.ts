import { installKomeiStartup } from "../../util/komeiStartup"
;(() => {
  try {
    installKomeiStartup(
      window,
      document,
      document.currentScript?.getAttribute("data-startup-slug") ?? "",
    )
  } catch {
    // A blocked or broken bootstrap must leave the default, readable document alone.
    document.documentElement.removeAttribute("data-komei-startup-cold")
  }
})()
