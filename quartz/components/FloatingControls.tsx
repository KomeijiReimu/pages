import Darkmode from "./Darkmode"
import Search from "./Search"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import styles from "./styles/floatingControls.scss"

const DarkmodeButton = Darkmode()
const SearchButton = Search()

const backToTopScript = `
(() => {
  const scriptFlag = "data-komei-floating-controls-bound"
  const existingController = window.__komeiBackToTopController
  if (existingController) {
    existingController.refresh()
    return
  }

  document.documentElement.setAttribute(scriptFlag, "true")

  const SHOW_SCROLL_Y = 420
  const HIDE_SCROLL_Y = 220
  let frame = 0
  let buttons = []
  let visibleState = false

  const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

  const hideButton = (button) => {
    button.classList.remove("is-visible")
    button.removeAttribute("data-komei-hide-pending")
    button.setAttribute("aria-hidden", "true")
    button.tabIndex = -1
  }

  const showButton = (button) => {
    button.removeAttribute("data-komei-hide-pending")
    button.classList.add("is-visible")
    button.setAttribute("aria-hidden", "false")
    button.tabIndex = 0
  }

  const applyBackToTopState = (visible, force = false) => {
    if (!force && visibleState === visible) return
    visibleState = visible

    for (const button of buttons) {
      if (visible) {
        showButton(button)
      } else if (document.activeElement === button) {
        button.setAttribute("data-komei-hide-pending", "true")
      } else {
        hideButton(button)
      }
    }
  }

  const refreshButtons = () => {
    buttons = [...document.querySelectorAll("[data-komei-back-to-top]")].filter(
      (button) => button instanceof HTMLButtonElement,
    )
    applyBackToTopState(window.scrollY > SHOW_SCROLL_Y, true)
  }

  const updateBackToTop = () => {
    frame = 0
    const scrollY = window.scrollY || 0
    const shouldBeVisible = visibleState ? scrollY > HIDE_SCROLL_Y : scrollY > SHOW_SCROLL_Y
    applyBackToTopState(shouldBeVisible)
  }

  const requestUpdate = () => {
    if (frame) return
    frame = window.requestAnimationFrame(updateBackToTop)
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest("[data-komei-back-to-top]")
    if (!(button instanceof HTMLButtonElement)) return

    event.preventDefault()
    if (event instanceof MouseEvent && event.detail > 0) button.blur()
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })
  })

  document.addEventListener("focusout", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest("[data-komei-back-to-top]")
    if (!(button instanceof HTMLButtonElement)) return
    if (button.hasAttribute("data-komei-hide-pending") && !visibleState) hideButton(button)
  })

  window.addEventListener("scroll", requestUpdate, { passive: true })
  window.addEventListener("resize", requestUpdate, { passive: true })
  document.addEventListener("nav", refreshButtons)
  window.addEventListener("pageshow", refreshButtons)
  window.addEventListener("pagehide", () => {
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
  })

  window.__komeiBackToTopController = { refresh: refreshButtons }
  refreshButtons()
})()
`

const FloatingControls: QuartzComponent = (props: QuartzComponentProps) => {
  return (
    <aside class="komei-floating-controls" aria-label="全局页面控制">
      <SearchButton {...props} />
      <DarkmodeButton {...props} />
      <button
        type="button"
        class="komei-back-to-top"
        data-komei-back-to-top
        aria-label="回到页面开头"
        aria-hidden="true"
        tabIndex={-1}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 19V5" />
          <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
        </svg>
      </button>
    </aside>
  )
}

FloatingControls.beforeDOMLoaded = concatenateResources(
  DarkmodeButton.beforeDOMLoaded,
  backToTopScript,
)
FloatingControls.afterDOMLoaded = SearchButton.afterDOMLoaded
FloatingControls.css = concatenateResources(DarkmodeButton.css, SearchButton.css, styles)

export default (() => FloatingControls) satisfies QuartzComponentConstructor
