// @ts-ignore
import script from "./scripts/komeiAnimations.inline"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const KomeiAnimations: QuartzComponent = () => null

KomeiAnimations.afterDOMLoaded = script

export default (() => KomeiAnimations) satisfies QuartzComponentConstructor
