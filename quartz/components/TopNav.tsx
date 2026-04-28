import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

const TopNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const homeHref = pathToRoot(slug)

  return (
    <nav class="komei-top-nav" aria-label="KomeiReimu 主导航">
      <a class="komei-top-nav__brand" href={homeHref}>
        <span class="komei-top-nav__mark" aria-hidden="true">
          {komeireimuConfig.profile.avatarInitials}
        </span>
        <span>
          <span class="komei-top-nav__title">{komeireimuConfig.site.name}</span>
          <span class="komei-top-nav__subtitle">{komeireimuConfig.site.subtitle}</span>
        </span>
      </a>
      <div class="komei-top-nav__links">
        {komeireimuConfig.navLinks.map((link) => (
          <a href={routeHref(slug, link.href)} title={link.description}>
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

export default (() => TopNav) satisfies QuartzComponentConstructor
