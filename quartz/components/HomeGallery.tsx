import { QuartzComponent, QuartzComponentConstructor } from "./types"
import { komeijireimuConfig } from "../komeijireimu.config"
import type { GalleryPhoto } from "../util/gallery"

function resolveFeaturedCount(total: number, configured: number): number {
  if (total <= 0) return 0
  if (total <= 5) return total

  const normalized = Number.isFinite(configured) ? Math.trunc(configured) : 4
  let count = Math.min(Math.max(normalized, 1), 5)
  if (total - count === 1) count -= 1
  return count
}

function PhotoFigure({ photo, className }: { photo: GalleryPhoto; className: string }) {
  return (
    <figure class={className}>
      <span class={`${className}__shell`}>
        <img
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
      </span>
    </figure>
  )
}

function AirmailStamp() {
  return (
    <span class="komei-home-gallery__stamp" aria-hidden="true">
      <span class="komei-home-gallery__seal">
        <svg class="komei-home-gallery__arc" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path id="komei-home-airmail-top" d="M18 54 A31.8 31.8 0 0 1 82 54" />
            <path id="komei-home-airmail-bottom" d="M15.5 54 A33 33 0 0 0 84.5 54" />
          </defs>
          <g>
            <path d="M16 48.3L17.2 51H20.1L17.7 52.8L18.6 55.7L16 53.9L13.4 55.7L14.3 52.8L11.9 51H14.8L16 48.3Z" />
            <path d="M84 48.3L85.2 51H88.1L85.7 52.8L86.6 55.7L84 53.9L81.4 55.7L82.3 52.8L79.9 51H82.8L84 48.3Z" />
            <text class="komei-home-gallery__ring-text komei-home-gallery__ring-text--top">
              <textPath href="#komei-home-airmail-top" startOffset="50%">
                AIR MAIL
              </textPath>
            </text>
            <text class="komei-home-gallery__ring-text komei-home-gallery__ring-text--bottom">
              <textPath href="#komei-home-airmail-bottom" startOffset="50%">
                KJR · 2026
              </textPath>
            </text>
          </g>
        </svg>
        <svg class="komei-home-gallery__plane" viewBox="-2.5 0 19 19" aria-hidden="true">
          <path d="M12.382 5.304 10.096 7.59l.006.02L11.838 14a.908.908 0 0 1-.211.794l-.573.573a.339.339 0 0 1-.566-.08l-2.348-4.25-.745-.746-1.97 1.97a3.311 3.311 0 0 1-.75.504l.44 1.447a.875.875 0 0 1-.199.79l-.175.176a.477.477 0 0 1-.672 0l-1.04-1.039-.018-.02-.788-.786-.02-.02-1.038-1.039a.477.477 0 0 1 0-.672l.176-.176a.875.875 0 0 1 .79-.197l1.447.438a3.322 3.322 0 0 1 .504-.75l1.97-1.97-.746-.744-4.25-2.348a.339.339 0 0 1-.08-.566l.573-.573a.909.909 0 0 1 .794-.211l6.39 1.736.02.006 2.286-2.286c.37-.372 1.621-1.02 1.993-.65.37.372-.279 1.622-.65 1.993z" />
        </svg>
      </span>
      <span class="komei-home-gallery__waves">
        {[0, 1, 2, 3].map(() => (
          <svg viewBox="0 0 42 8" fill="none" aria-hidden="true">
            <path d="M1 4C4 1.5 8 1.5 11 4C14 6.5 18 6.5 21 4C24 1.5 28 1.5 31 4C34 6.5 38 6.5 41 4" />
          </svg>
        ))}
      </span>
    </span>
  )
}

const HomeGallery: QuartzComponent = ({ galleryPhotos: photos = [] }) => {
  const config = komeijireimuConfig.homepage.gallery
  if (!config.enabled) return null

  if (photos.length === 0) return null

  const featuredCount = resolveFeaturedCount(photos.length, config.featuredCount)
  const featuredPaths = new Set(
    photos
      .filter((photo) => photo.featured)
      .concat(photos.filter((photo) => !photo.featured))
      .slice(0, featuredCount)
      .map((photo) => photo.relativePath),
  )
  const featured = photos.filter((photo) => featuredPaths.has(photo.relativePath))
  const masonry = photos.filter((photo) => !featuredPaths.has(photo.relativePath))
  const postcard = config.postcard
  const profile = komeijireimuConfig.profile

  return (
    <section class="komei-home-gallery" id="gallery" aria-labelledby="komei-home-gallery-title">
      <p class="komei-home-gallery__kicker">{config.eyebrow}</p>

      <div class="komei-home-gallery__seasons-panel">
        <div class="komei-home-gallery__seasons-head">
          <p>{postcard.timestamp}</p>
          <h2 id="komei-home-gallery-title">{config.title}</h2>
        </div>

        <div class="komei-home-gallery__seasons-layout">
          <div class="komei-home-gallery__seasons-grid" data-photo-count={String(featured.length)}>
            {featured.map((photo) => (
              <PhotoFigure photo={photo} className="komei-home-gallery-season" />
            ))}
          </div>

          <article class="komei-home-gallery__postcard-card" aria-label={postcard.title}>
            <AirmailStamp />
            <div class="komei-home-gallery__post-header">
              {profile.avatar?.src ? (
                <img
                  class="komei-home-gallery__avatar komei-home-gallery__avatar--image"
                  src={profile.avatar.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                />
              ) : (
                <div class="komei-home-gallery__avatar" aria-hidden="true">
                  {profile.avatarInitials}
                </div>
              )}
              <div>
                <strong>{profile.name}</strong>
                <span>{profile.handle}</span>
              </div>
            </div>
            <div class="komei-home-gallery__post-body">
              <p class="komei-home-gallery__hashtag">#{postcard.title}</p>
              {postcard.lines.map((line) => (
                <p>{line}</p>
              ))}
            </div>
            <div class="komei-home-gallery__post-meta">
              <time>{postcard.timestamp}</time>
              {postcard.location && <span>{postcard.location}</span>}
            </div>
          </article>
        </div>
      </div>

      {masonry.length > 0 && (
        <div class="komei-home-gallery__masonry-viewport">
          <div
            class="komei-home-gallery__masonry"
            data-photo-count={String(masonry.length)}
            aria-label="摄影瀑布流"
          >
            {masonry.map((photo) => (
              <PhotoFigure photo={photo} className="komei-home-gallery-masonry" />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default (() => HomeGallery) satisfies QuartzComponentConstructor
