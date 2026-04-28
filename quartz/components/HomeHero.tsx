import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

const HomeHero: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const { hero } = komeireimuConfig.homepage
  const { profile } = komeireimuConfig

  return (
    <section class="komei-home-hero" aria-labelledby="komei-home-title">
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
      <aside class="komei-profile-card" aria-label="KomeiReimu profile">
        <div class="komei-profile-card__avatar" aria-hidden="true">
          {profile.avatarInitials}
        </div>
        <p class="komei-profile-card__handle">{profile.handle}</p>
        <h2>{profile.name}</h2>
        <p>{profile.bio}</p>
        <dl class="komei-profile-card__facts">
          <div>
            <dt>状态</dt>
            <dd>{profile.status}</dd>
          </div>
          <div>
            <dt>位置</dt>
            <dd>{profile.location}</dd>
          </div>
        </dl>
        <div class="komei-profile-card__socials">
          {profile.socials.map((social) => (
            <a
              class={`internal komei-chip komei-chip--${social.tone}`}
              href={routeHref(slug, social.href as `/${string}`)}
            >
              {social.label}
            </a>
          ))}
        </div>
      </aside>
    </section>
  )
}

export default (() => HomeHero) satisfies QuartzComponentConstructor
