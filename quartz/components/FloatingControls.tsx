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
  if (document.documentElement.getAttribute(scriptFlag) === "true") return
  document.documentElement.setAttribute(scriptFlag, "true")

  let frame = 0
  let buttons = []
  let visibleState = false

  const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

  const refreshButtons = () => {
    buttons = [...document.querySelectorAll("[data-komei-back-to-top]")].filter(
      (button) => button instanceof HTMLButtonElement,
    )
    visibleState = false
    applyBackToTopState(window.scrollY > 360, true)
  }

  const applyBackToTopState = (visible, force = false) => {
    if (!force && visibleState === visible) return
    visibleState = visible
    for (const button of buttons) {
      button.classList.toggle("is-visible", visible)
      button.setAttribute("aria-hidden", visible ? "false" : "true")
      button.tabIndex = visible ? 0 : -1
    }
  }

  const updateBackToTop = () => {
    frame = 0
    applyBackToTopState(window.scrollY > 360)
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
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })
  })

  window.addEventListener("scroll", requestUpdate, { passive: true })
  window.addEventListener("resize", requestUpdate, { passive: true })
  document.addEventListener("nav", refreshButtons)
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
        <span aria-hidden="true">↑</span>
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
