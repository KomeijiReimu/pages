export type HomePrelude = {
  readonly enterTimeoutMs: number
  readonly exitTimeoutMs: number
  enter(onHandoffReady: () => void): void
  exit(onGone: () => void): void
  dispose(): void
}

const enterMs = 2050
const exitMs = 1250

// The sheet, silk and title have separate exit clocks. The sheet clears early
// enough to see the original Hero's first movement; only the silk has a tail.
export const homePreludeStyle = `
.komei-lightleaf {
  --leaf-paper: #eef2eb;
  --leaf-ink: #284a45;
  --leaf-silk: #78aaa0;
  --leaf-fold: #b4cfc0;
  --leaf-pearl: #fff9e8;
  --leaf-edge: #f5edca;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  overflow: hidden;
  isolation: isolate;
  contain: strict;
  pointer-events: none;
  user-select: none;
}
.komei-lightleaf, .komei-lightleaf * { pointer-events: none !important; }
html[saved-theme="dark"] .komei-lightleaf {
  --leaf-paper: #0c1c23;
  --leaf-ink: #e6eade;
  --leaf-silk: #386c69;
  --leaf-fold: #568d80;
  --leaf-pearl: #93b4a0;
  --leaf-edge: #d2cda2;
}
.komei-lightleaf__paper,
.komei-lightleaf__silk,
.komei-lightleaf__flow,
.komei-lightleaf__light {
  position: absolute;
  inset: 0;
}
.komei-lightleaf__paper {
  background:
    radial-gradient(ellipse at 24% 84%, color-mix(in srgb, var(--leaf-fold) 34%, transparent), transparent 62%),
    radial-gradient(ellipse at 78% 18%, color-mix(in srgb, var(--leaf-pearl) 24%, transparent), transparent 56%),
    var(--leaf-paper);
}
.komei-lightleaf__silk { inset: -12%; }
.komei-lightleaf__flow {
  transform-origin: 30% 72%;
  transform: translate3d(-8%, 15%, 0) rotate(-9deg) scale(1.06);
  opacity: .72;
}
.komei-lightleaf__flow svg { display: block; width: 100%; height: 100%; overflow: visible; }
.komei-lightleaf__silk--far .komei-lightleaf__flow {
  transform: translate3d(-5%, 10%, 0) rotate(-6deg) scale(1.04);
  opacity: .5;
}
.komei-lightleaf__silk--near .komei-lightleaf__flow {
  transform: translate3d(-12%, 20%, 0) rotate(-12deg) scale(1.1);
  opacity: .8;
}
.komei-lightleaf__light {
  inset: -45%;
  background: linear-gradient(125deg, transparent 37%, color-mix(in srgb, var(--leaf-pearl) 42%, transparent) 49%, transparent 61%);
  opacity: 0;
  transform: translate3d(-16%, 10%, 0) rotate(-8deg);
}
.komei-lightleaf__book {
  position: absolute;
  left: 50%;
  top: 46.5%;
  width: min(86vw, 1000px);
  aspect-ratio: 2 / 1;
  transform: translate(-50%, -50%);
}
.komei-lightleaf__pages,
.komei-lightleaf__pages svg { display: block; width: 100%; height: 100%; }
.komei-lightleaf__pages svg { overflow: visible; }
.komei-lightleaf__spread {
  transform-box: view-box;
  transform-origin: 500px 250px;
}
.komei-lightleaf__spread--back { transform: translateY(-22px) scale(1.035, 1.025); }
.komei-lightleaf__spread--middle { transform: translateY(-10px) scale(1.015, 1.01); }
.komei-lightleaf__wing {
  transform-box: view-box;
  transform-origin: 500px 250px;
  opacity: 0;
  transform: scale(.08, .82);
}
.komei-lightleaf__page-edge { opacity: .62; }
.komei-lightleaf[data-entered] .komei-lightleaf__wing {
  animation: komei-lightleaf-page-open 1700ms 300ms cubic-bezier(.22,.61,.25,1) both;
}
.komei-lightleaf[data-entered] .komei-lightleaf__spread--back .komei-lightleaf__wing {
  animation-delay: 120ms;
}
.komei-lightleaf[data-entered] .komei-lightleaf__spread--middle .komei-lightleaf__wing {
  animation-delay: 210ms;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__pages {
  animation: komei-lightleaf-pages-away 660ms cubic-bezier(.22,.55,.3,1) both;
}
@keyframes komei-lightleaf-page-open {
  0% { opacity: 0; transform: scale(.08, .82); }
  24% { opacity: .36; }
  66% { opacity: .86; }
  100% { opacity: .72; transform: scale(1, 1); }
}
@keyframes komei-lightleaf-pages-away {
  from { opacity: 1; transform: translate3d(0,0,0) scale(1); }
  45% { opacity: .22; }
  to { opacity: 0; transform: translate3d(0,-8px,0) scale(1.035); }
}
.komei-lightleaf__words {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0 6vw 7vh;
}
.komei-lightleaf__title {
  display: block;
  color: var(--leaf-ink);
  font-family: var(--headerFont);
  font-size: clamp(2rem, 5.7vw, 5.5rem);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: .08em;
  white-space: nowrap;
  opacity: 0;
  transform: translate3d(0, 22px, 0) scale(.975);
  text-shadow: 0 2px 30px color-mix(in srgb, var(--leaf-paper) 65%, transparent);
}
.komei-lightleaf[data-entered] .komei-lightleaf__flow {
  animation: komei-lightleaf-flow ${enterMs}ms cubic-bezier(.22,.61,.25,1) both;
}
.komei-lightleaf[data-entered] .komei-lightleaf__silk--far .komei-lightleaf__flow {
  animation-name: komei-lightleaf-flow-far;
}
.komei-lightleaf[data-entered] .komei-lightleaf__silk--near .komei-lightleaf__flow {
  animation-name: komei-lightleaf-flow-near;
}
.komei-lightleaf[data-entered] .komei-lightleaf__light {
  animation: komei-lightleaf-light ${enterMs}ms cubic-bezier(.25,.46,.45,.94) both;
}
.komei-lightleaf[data-entered] .komei-lightleaf__title {
  animation: komei-lightleaf-title 1000ms 460ms cubic-bezier(.2,.65,.25,1) both;
}
.komei-lightleaf[data-exiting] {
  animation: komei-lightleaf-gone ${exitMs}ms linear both;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__paper {
  animation: komei-lightleaf-paper 660ms cubic-bezier(.22,.55,.3,1) both;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__words {
  animation: komei-lightleaf-words 360ms ease-out both;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__silk {
  animation: komei-lightleaf-part ${exitMs}ms cubic-bezier(.2,.58,.24,1) both;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__silk--far {
  animation-name: komei-lightleaf-part-far;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__silk--near {
  animation-name: komei-lightleaf-part-near;
}
.komei-lightleaf[data-exiting] .komei-lightleaf__light {
  opacity: 0;
  animation: none;
}
@keyframes komei-lightleaf-flow {
  from { transform: translate3d(-8%,15%,0) rotate(-9deg) scale(1.06); opacity: .72; }
  54% { opacity: .92; }
  to { transform: translate3d(2%,-3%,0) rotate(2deg) scale(1); opacity: .82; }
}
@keyframes komei-lightleaf-flow-far {
  from { transform: translate3d(-5%,10%,0) rotate(-6deg) scale(1.04); opacity: .5; }
  to { transform: translate3d(4%,-5%,0) rotate(4deg) scale(1.02); opacity: .64; }
}
@keyframes komei-lightleaf-flow-near {
  from { transform: translate3d(-12%,20%,0) rotate(-12deg) scale(1.1); opacity: .8; }
  60% { opacity: .94; }
  to { transform: translate3d(0,1%,0) rotate(-1deg) scale(1.02); opacity: .76; }
}
@keyframes komei-lightleaf-light {
  0% { opacity: 0; transform: translate3d(-16%,10%,0) rotate(-8deg); }
  45% { opacity: .65; }
  100% { opacity: 0; transform: translate3d(22%,-12%,0) rotate(6deg); }
}
@keyframes komei-lightleaf-title {
  from { opacity: 0; transform: translate3d(0,22px,0) scale(.975); }
  to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
}
@keyframes komei-lightleaf-paper {
  from { opacity: 1; }
  45% { opacity: .36; }
  to { opacity: 0; }
}
@keyframes komei-lightleaf-words {
  from { opacity: 1; transform: translate3d(0,0,0); }
  to { opacity: 0; transform: translate3d(0,-10px,0); }
}
@keyframes komei-lightleaf-part {
  from { opacity: 1; transform: translate3d(0,0,0); }
  48% { opacity: .38; }
  to { opacity: 0; transform: translate3d(-17%,18%,0) rotate(-7deg); }
}
@keyframes komei-lightleaf-part-far {
  from { opacity: 1; transform: translate3d(0,0,0); }
  50% { opacity: .3; }
  to { opacity: 0; transform: translate3d(15%,-19%,0) rotate(8deg); }
}
@keyframes komei-lightleaf-part-near {
  from { opacity: 1; transform: translate3d(0,0,0); }
  42% { opacity: .26; }
  to { opacity: 0; transform: translate3d(-9%,25%,0) rotate(-5deg); }
}
@keyframes komei-lightleaf-gone {
  0%, 84% { opacity: 1; }
  100% { opacity: 0; }
}
@media (max-width: 600px) {
  .komei-lightleaf__silk { inset: -8% -36%; }
  .komei-lightleaf__book { top: 45.5%; width: 96vw; }
  .komei-lightleaf__words { padding-bottom: 9vh; }
  .komei-lightleaf__title { font-size: clamp(1.7rem, 7.1vw, 2.65rem); letter-spacing: .045em; }
}
@media (prefers-reduced-motion: reduce) {
  .komei-lightleaf { display: none; }
  .komei-lightleaf * { animation: none !important; }
}
`

let nextPreludeId = 0

export function createHomePrelude(win: Window, doc: Document): HomePrelude {
  const id = `komei-lightleaf-${++nextPreludeId}`
  const root = doc.createElement("div")
  root.className = "komei-lightleaf"
  root.setAttribute("aria-hidden", "true")

  const part = (name: string, parent = root) => {
    const element = doc.createElement("div")
    element.className = `komei-lightleaf__${name}`
    parent.appendChild(element)
    return element
  }

  part("paper")
  // Broad open folds, not closed orbits. Separate outer/inner layers keep the
  // exit continuous without replacing an in-flight transform on the same node.
  const folds = [
    {
      name: "far",
      shape:
        "M-180 750 C180 810 360 170 800 200 C1110 220 1260 550 1640 180 L1640 -100 C1230 340 1060 20 730 70 C280 130 130 650 -180 540 Z",
      edge: "M-180 750 C180 810 360 170 800 200 C1110 220 1260 550 1640 180",
    },
    {
      name: "middle",
      shape:
        "M-200 1050 C100 1010 310 420 700 550 C1000 650 1160 430 1640 500 L1640 740 C1170 580 1010 940 640 730 C300 540 200 1230 -200 1240 Z",
      edge: "M-200 1050 C100 1010 310 420 700 550 C1000 650 1160 430 1640 500",
    },
    {
      name: "near",
      shape:
        "M-200 1060 C230 630 440 1050 870 810 C1180 640 1360 760 1640 620 L1640 1040 C1290 1020 1200 880 910 1020 C440 1240 260 820 -200 1290 Z",
      edge: "M-200 1060 C230 630 440 1050 870 810 C1180 640 1360 760 1640 620",
    },
  ]

  for (const fold of folds) {
    const silk = part(`silk komei-lightleaf__silk--${fold.name}`)
    const flow = part("flow", silk)
    const gradient = `${id}-${fold.name}`
    // Only module-owned literal paths and a numeric instance ID enter this SVG.
    flow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${gradient}" x1="0" y1="0" x2=".65" y2="1">
          <stop offset="0" stop-color="var(--leaf-silk)" stop-opacity=".08"/>
          <stop offset=".34" stop-color="var(--leaf-fold)" stop-opacity=".5"/>
          <stop offset=".57" stop-color="var(--leaf-pearl)" stop-opacity=".85"/>
          <stop offset=".65" stop-color="var(--leaf-fold)" stop-opacity=".72"/>
          <stop offset="1" stop-color="var(--leaf-silk)" stop-opacity=".12"/>
        </linearGradient>
        <linearGradient id="${gradient}-edge" x1="0" y1="1" x2="1" y2="0">
          <stop stop-color="var(--leaf-edge)" stop-opacity="0"/>
          <stop offset=".44" stop-color="var(--leaf-edge)" stop-opacity=".8"/>
          <stop offset="1" stop-color="var(--leaf-edge)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${fold.shape}" fill="url(#${gradient})"/>
      <path d="${fold.edge}" fill="none" stroke="url(#${gradient}-edge)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    </svg>`
  }

  // A soft, open folio behind the unchanged title. Both wings unfurl from the
  // same centre; no perspective hinge, hard cover or additional timing owner.
  const book = part("book")
  const pages = part("pages", book)
  const pageWash = `${id}-page-wash`
  const pageEdge = `${id}-page-edge`
  const pageShape =
    "M500 158 C403 91 254 50 94 78 C113 170 116 272 72 373 C249 340 404 369 500 428 C476 333 477 243 500 158 Z"
  const pageRim = "M94 78 C254 50 403 91 500 158 M72 373 C249 340 404 369 500 428"
  pages.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${pageWash}" x1="0" y1="0" x2=".4" y2="1">
        <stop stop-color="var(--leaf-pearl)" stop-opacity=".32"/>
        <stop offset=".32" stop-color="var(--leaf-fold)" stop-opacity=".16"/>
        <stop offset=".54" stop-color="var(--leaf-paper)" stop-opacity=".06"/>
        <stop offset=".83" stop-color="var(--leaf-pearl)" stop-opacity=".24"/>
        <stop offset="1" stop-color="var(--leaf-silk)" stop-opacity=".08"/>
      </linearGradient>
      <linearGradient id="${pageEdge}" x1="0" y1="0" x2="1" y2=".65">
        <stop stop-color="var(--leaf-edge)" stop-opacity=".12"/>
        <stop offset=".35" stop-color="var(--leaf-edge)" stop-opacity=".95"/>
        <stop offset=".72" stop-color="var(--leaf-pearl)" stop-opacity=".65"/>
        <stop offset="1" stop-color="var(--leaf-edge)" stop-opacity=".08"/>
      </linearGradient>
    </defs>
    ${["back", "middle", "front"]
      .map(
        (depth) => `<g class="komei-lightleaf__spread komei-lightleaf__spread--${depth}">
      ${[false, true]
        .map(
          (right) => `<g class="komei-lightleaf__wing">
        <g${right ? ' transform="translate(1000 0) scale(-1 1)"' : ""}>
          <path d="${pageShape}" fill="url(#${pageWash})" stroke="var(--leaf-silk)" stroke-opacity=".2" stroke-width=".75" vector-effect="non-scaling-stroke"/>
          <path class="komei-lightleaf__page-edge" d="${pageRim}" fill="none" stroke="url(#${pageEdge})" stroke-width="1.1" vector-effect="non-scaling-stroke"/>
        </g>
      </g>`,
        )
        .join("")}
    </g>`,
      )
      .join("")}
  </svg>`

  const light = part("light")
  const words = part("words")
  const title = doc.createElement("span")
  title.className = "komei-lightleaf__title"
  title.textContent = "知识的幻想乡。"
  words.appendChild(title)
  doc.body.appendChild(root)

  let state: "mounted" | "entering" | "ready" | "exiting" | "disposed" = "mounted"
  let removeAnimationListener: (() => void) | undefined

  const clearAnimationListener = () => {
    removeAnimationListener?.()
    removeAnimationListener = undefined
  }

  const onAnimationEnd = (target: HTMLElement, name: string, finish: () => void) => {
    const listener = (event: AnimationEvent) => {
      if (event.target !== target || event.animationName !== name || event.pseudoElement !== "")
        return
      finish()
    }
    target.addEventListener("animationend", listener)
    removeAnimationListener = () => target.removeEventListener("animationend", listener)
  }

  const dispose = () => {
    if (state === "disposed") return
    state = "disposed"
    clearAnimationListener()
    // Removing our subtree also cancels all of its CSS animations.
    root.remove()
  }

  return {
    enterTimeoutMs: enterMs + 200,
    exitTimeoutMs: exitMs + 150,
    enter(onHandoffReady) {
      if (state !== "mounted") return
      state = "entering"
      const ready = () => {
        if (state !== "entering") return
        clearAnimationListener()
        state = "ready"
        onHandoffReady()
      }
      if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) ready()
      else {
        // This sweep shares the full entrance clock with the folds. Listen
        // before starting it; delayed first paint must not shorten the phase.
        onAnimationEnd(light, "komei-lightleaf-light", ready)
        root.setAttribute("data-entered", "")
      }
    },
    exit(onGone) {
      if (state === "disposed" || state === "exiting") return
      clearAnimationListener()
      state = "exiting"
      const gone = () => {
        if (state !== "exiting") return
        dispose()
        onGone()
      }
      if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) gone()
      else {
        // Only the root's full exit can remove the subtree. Shorter title and
        // paper animations, and bubbling descendant events, cannot cut it off.
        onAnimationEnd(root, "komei-lightleaf-gone", gone)
        root.setAttribute("data-exiting", "")
      }
    },
    dispose,
  }
}
