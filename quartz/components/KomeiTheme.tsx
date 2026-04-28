import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const KomeiTheme: QuartzComponent = () => {
  const background = komeireimuConfig.background

  return (
    <style>{`
:root {
  --komei-bg-base: ${background.base};
  --komei-bg-wash: ${background.wash};
  --komei-bg-orb-primary: ${background.primaryOrb};
  --komei-bg-orb-secondary: ${background.secondaryOrb};
  --komei-bg-grid: ${background.grid};
  --komei-grain-opacity: ${background.grainOpacity};
}
`}</style>
  )
}

export default (() => KomeiTheme) satisfies QuartzComponentConstructor
