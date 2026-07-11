// @ts-ignore
import darkmodeScript from "./scripts/darkmode.inline"
import styles from "./styles/darkmode.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const Darkmode: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button
      type="button"
      class={classNames(displayClass, "darkmode")}
      aria-label="切换到深色模式"
      aria-pressed="false"
      data-theme-state="light"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="dayIcon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="3.75" />
        <path d="M12 2.5v2" />
        <path d="M12 19.5v2" />
        <path d="m5.28 5.28 1.42 1.42" />
        <path d="m17.3 17.3 1.42 1.42" />
        <path d="M2.5 12h2" />
        <path d="M19.5 12h2" />
        <path d="m5.28 18.72 1.42-1.42" />
        <path d="m17.3 6.7 1.42-1.42" />
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="nightIcon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20.35 15.1A8.55 8.55 0 0 1 8.9 3.65 8.56 8.56 0 1 0 20.35 15.1Z" />
      </svg>
    </button>
  )
}

Darkmode.beforeDOMLoaded = darkmodeScript
Darkmode.css = styles

export default (() => Darkmode) satisfies QuartzComponentConstructor
