import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

function isRouteHref(href: string): href is `/${string}` {
  return href.startsWith("/")
}

function profileHref(slug: FullSlug, href: string): string {
  return isRouteHref(href) ? routeHref(slug, href) : href
}

const HomeHero: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const { hero } = komeireimuConfig.homepage
  const { profile } = komeireimuConfig

  return (
    <section class="komei-home-hero" aria-labelledby="komei-home-title">
      <aside class="komei-profile-card" aria-label="KomeiReimu profile">
        <span class="komei-profile-card__glow komei-profile-card__glow--one" aria-hidden="true" />
        <span class="komei-profile-card__glow komei-profile-card__glow--two" aria-hidden="true" />
        <div class="komei-profile-card__avatar-shell">
          <div class="komei-profile-card__avatar" aria-hidden="true">
            {profile.avatarInitials}
          </div>
          <span class="komei-profile-card__badge">{profile.badge}</span>
        </div>
        <p class="komei-profile-card__handle">{profile.handle}</p>
        <h2>{profile.name}</h2>
        <p class="komei-profile-card__bio">{profile.bio}</p>
        <p class="komei-profile-card__motto">{profile.motto}</p>
        <dl class="komei-profile-card__facts">
          {profile.facts.map((fact) => (
            <div>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div class="komei-profile-card__socials" aria-label="个人入口与联系方式">
          {profile.socials.map((social) => (
            <a
              class={`${isRouteHref(social.href) ? "internal " : ""}komei-profile-link komei-profile-link--${social.tone}`}
              href={profileHref(slug, social.href)}
              aria-label={social.description}
            >
              <span aria-hidden="true">{social.icon}</span>
              <strong>{social.label}</strong>
            </a>
          ))}
        </div>
      </aside>
      <div class="komei-home-hero__banner">
        <div class="komei-home-hero__visual" aria-hidden="true">
          <span class="komei-home-hero__sun" />
          <span class="komei-home-hero__cloud komei-home-hero__cloud--one" />
          <span class="komei-home-hero__cloud komei-home-hero__cloud--two" />
          <span class="komei-home-hero__note komei-home-hero__note--one" />
          <span class="komei-home-hero__note komei-home-hero__note--two" />
          <span class="komei-home-hero__rail" />
        </div>
        <div class="komei-home-hero__copy">
          <div class="komei-home-hero__eyebrow">{hero.eyebrow}</div>
          <h1 id="komei-home-title">{hero.title}</h1>
          <p>{hero.lead}</p>
          <div class="komei-home-hero__actions">
            <a
              class="internal komei-button komei-button--primary"
              href={routeHref(slug, hero.primaryAction.href)}
            >
              {hero.primaryAction.label}
            </a>
            <a
              class="internal komei-button komei-button--ghost"
              href={routeHref(slug, hero.secondaryAction.href)}
            >
              {hero.secondaryAction.label}
            </a>
          </div>
        </div>
        <dl class="komei-home-hero__stats">
          {hero.stats.map((stat) => (
            <div>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export default (() => HomeHero) satisfies QuartzComponentConstructor
