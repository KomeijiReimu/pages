import { komeijireimuConfig, type KomeiQuickLink } from "../komeijireimu.config"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const AboutIdentity: QuartzComponent = () => {
  const { profile } = komeijireimuConfig
  const links = (profile.links as KomeiQuickLink[]).filter(
    (link) => link.enabled !== false && link.href.trim(),
  )

  return (
    <aside class="komei-about-identity" aria-label={`${profile.name} 个人资料`}>
      {profile.avatar.src && (
        <img src={profile.avatar.src} alt={profile.avatar.alt} width="88" height="88" />
      )}
      <h2>{profile.name}</h2>
      <p class="komei-about-identity__handle">{profile.handle}</p>
      <p>{profile.motto}</p>
      <div class="komei-about-identity__links">
        {links.map((link) => (
          <a
            href={link.href}
            {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {link.label}
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </aside>
  )
}

export default (() => AboutIdentity) satisfies QuartzComponentConstructor
