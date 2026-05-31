import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import {
  komeijireimuConfig,
  type KomeiProfileFact,
  type KomeiQuickLink,
} from "../komeijireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

function resourceHref(slug: FullSlug, href: `/${string}`): string {
  const route = href.replace(/^\/+/, "")
  return joinSegments(pathToRoot(slug), route)
}

function isRouteHref(href: string): href is `/${string}` {
  return href.startsWith("/")
}

function profileHref(slug: FullSlug, href: string): string {
  if (href.trim().length === 0) return "#"
  if (isRouteHref(href) && /\.[a-z0-9]+$/i.test(href)) return resourceHref(slug, href)
  return isRouteHref(href) ? routeHref(slug, href) : href
}

function ProfileLinkIcon({ icon }: { icon: string }) {
  if (icon === "github") {
    return (
      <svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
      </svg>
    )
  }

  if (icon === "mail") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    )
  }

  if (icon === "archive") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
    )
  }

  if (icon === "book") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
    )
  }

  if (icon === "rss") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 11a9 9 0 0 1 9 9"></path>
        <path d="M4 4a16 16 0 0 1 16 16"></path>
        <circle cx="5" cy="19" r="1"></circle>
      </svg>
    )
  }

  if (icon === "tag") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
        <line x1="7" y1="7" x2="7.01" y2="7"></line>
      </svg>
    )
  }

  if (icon === "home") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1.2em"
        height="1.2em"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    )
  }

  return icon
}

function heroBannerStyle(background: typeof komeijireimuConfig.homepage.hero.background) {
  if (!background?.src) return undefined

  return [
    `--komei-hero-bg-image: url("${background.src.replace(/"/g, "%22")}")`,
    `--komei-hero-bg-opacity: ${background.opacity ?? "0.14"}`,
    `--komei-hero-bg-position: ${background.position ?? "center"}`,
    `--komei-hero-bg-size: ${background.size ?? "cover"}`,
    `--komei-hero-bg-repeat: ${background.repeat ?? "no-repeat"}`,
    `--komei-hero-bg-blend-mode: ${background.blendMode ?? "soft-light"}`,
  ].join(";")
}

const HomeHero: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const { hero } = komeijireimuConfig.homepage
  const { profile } = komeijireimuConfig
  const profileFacts = (profile.facts as KomeiProfileFact[]).filter(
    (fact) => !("enabled" in fact) || fact.enabled !== false,
  )
  const profileLinks = (profile.links as KomeiQuickLink[]).filter(
    (link) => !("enabled" in link) || link.enabled !== false,
  )
  const iconLinks = profileLinks.filter((link) => (link.variant ?? "icon") === "icon")
  const pillLinks = profileLinks.filter((link) => link.variant === "pill")

  const renderProfileLink = (link: (typeof profileLinks)[number]) => {
    const variant = link.variant ?? "icon"
    const isPlaceholder = link.href.trim().length === 0
    const isInternal = !isPlaceholder && isRouteHref(link.href)
    const linkClass = `${isInternal ? "internal " : ""}komei-profile-link komei-profile-link--${variant} komei-profile-link--${link.tone}${isPlaceholder ? " komei-profile-link--empty" : ""}`
    const linkContent = (
      <>
        <span aria-hidden="true" class="komei-profile-link__icon" data-icon={link.icon}>
          <ProfileLinkIcon icon={link.icon} />
        </span>
        <strong>{link.label}</strong>
      </>
    )

    if (isPlaceholder) {
      return (
        <span class={linkClass} aria-label={link.description} aria-disabled="true">
          {linkContent}
        </span>
      )
    }

    return (
      <a
        class={linkClass}
        href={profileHref(slug, link.href)}
        aria-label={link.description}
        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {linkContent}
      </a>
    )
  }

  return (
    <section
      class="komei-home-hero komei-home-hero--editorial"
      aria-labelledby="komei-home-title"
      style={heroBannerStyle(hero.background)}
    >
      {hero.background?.src && <span class="komei-home-hero__backdrop" aria-hidden="true" />}
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
      <aside class="komei-profile-card" aria-label={`${profile.name} 个人资料`}>
        <header class="komei-profile-card__identity">
          <div class="komei-profile-card__avatar-shell">
            <div class="komei-profile-card__avatar" aria-hidden="true">
              {profile.avatarInitials}
            </div>
          </div>
          <div class="komei-profile-card__name-group">
            <h2>{profile.name}</h2>
            <span class="komei-profile-card__handle">{profile.handle}</span>
          </div>
        </header>
        <p class="komei-profile-card__motto">{profile.motto}</p>
        <span class="komei-profile-card__divider" aria-hidden="true" />
        {profileFacts.length > 0 && (
          <dl class="komei-profile-card__facts">
            {profileFacts.map((fact) => (
              <div>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {(iconLinks.length > 0 || pillLinks.length > 0) && (
          <div class="komei-profile-card__socials" aria-label="个人入口与联系方式">
            {iconLinks.length > 0 && (
              <div class="komei-profile-card__link-grid komei-profile-card__link-grid--icons">
                {iconLinks.map(renderProfileLink)}
              </div>
            )}
            {pillLinks.length > 0 && (
              <div class="komei-profile-card__link-grid komei-profile-card__link-grid--pills">
                {pillLinks.map(renderProfileLink)}
              </div>
            )}
          </div>
        )}
      </aside>
    </section>
  )
}

export default (() => HomeHero) satisfies QuartzComponentConstructor
