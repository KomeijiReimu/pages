import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const HomeModules: QuartzComponent = () => {
  const copy = komeireimuConfig.homepage.sections.modules

  return (
    <section class="komei-home-modules" aria-labelledby="komei-modules-title">
      <div class="komei-section-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="komei-modules-title">{copy.title}</h2>
      </div>
      <div class="komei-home-modules__grid">
        {komeireimuConfig.homepage.modules.map((module) => (
          <article class={`komei-module-card komei-module-card--${module.key}`}>
            <p class="komei-module-card__eyebrow">{module.eyebrow}</p>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <ul>
              {module.items.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

export default (() => HomeModules) satisfies QuartzComponentConstructor
