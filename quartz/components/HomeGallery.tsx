import fs from "fs"
import path from "path"
import yaml from "js-yaml"
import { QuartzComponent, QuartzComponentConstructor } from "./types"
import { komeireimuConfig } from "../komeireimu.config"

type GalleryPhotoMeta = {
  title?: string
  alt?: string
  date?: string | Date
  location?: string
  featured?: boolean
  order?: number
}

type GalleryPhoto = Required<Pick<GalleryPhotoMeta, "title" | "alt">> &
  Pick<GalleryPhotoMeta, "date" | "location" | "featured" | "order"> & {
    src: string
    relativePath: string
  }

type GalleryMetadata = {
  photos?: Record<string, GalleryPhotoMeta>
}

const supportedImage = /\.(avif|jpe?g|png|webp)$/i

function safeReadMetadata(sourceRoot: string): GalleryMetadata {
  for (const fileName of ["_gallery.yml", "_gallery.yaml"]) {
    const metadataPath = path.join(sourceRoot, fileName)
    if (!fs.existsSync(metadataPath)) continue
    const raw = fs.readFileSync(metadataPath, "utf8")
    return (yaml.load(raw) as GalleryMetadata | undefined) ?? {}
  }

  return {}
}

function walkImages(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return walkImages(fullPath)
      return supportedImage.test(entry.name) ? [fullPath] : []
    })
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
}

function titleFromFileName(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName))
  const match = stem.match(/(20\d{2})(\d{2})(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]} 的照片`
  return stem.replace(/[-_]+/g, " ")
}

function dateFromFileName(fileName: string): string | undefined {
  const match = path.basename(fileName).match(/(20\d{2})(\d{2})(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

function normalizeDate(date: string | Date | undefined): string | undefined {
  if (!date) return undefined
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  return String(date)
}

function publicPath(sourceDir: string, relativePath: string): string {
  const publicRoot = sourceDir.replace(/^content\/?/, "")
  return `/${path.posix.join(publicRoot, relativePath.split(path.sep).join("/"))}`
}

function loadGalleryPhotos(): GalleryPhoto[] {
  const config = komeireimuConfig.homepage.gallery
  const sourceRoot = path.join(process.cwd(), config.sourceDir)
  const metadata = safeReadMetadata(sourceRoot).photos ?? {}

  return walkImages(sourceRoot)
    .map((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath)
      const normalizedPath = relativePath.split(path.sep).join("/")
      const meta = metadata[normalizedPath] ?? metadata[path.basename(filePath)] ?? {}
      const title = meta.title ?? titleFromFileName(filePath)
      return {
        src: publicPath(config.sourceDir, relativePath),
        relativePath: normalizedPath,
        title,
        alt: meta.alt ?? title,
        date: normalizeDate(meta.date) ?? dateFromFileName(filePath),
        location: meta.location,
        featured: meta.featured,
        order: meta.order,
      }
    })
    .sort((a, b) => {
      const orderA = a.order ?? Number.POSITIVE_INFINITY
      const orderB = b.order ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return (
        (b.date ?? "").localeCompare(a.date ?? "") || a.relativePath.localeCompare(b.relativePath)
      )
    })
}

function photoMeta(photo: GalleryPhoto) {
  return [photo.date, photo.location].filter(Boolean).join(" · ")
}

const HomeGallery: QuartzComponent = () => {
  const config = komeireimuConfig.homepage.gallery
  if (!config.enabled) return null

  const photos = loadGalleryPhotos().slice(0, config.maxItems)
  if (photos.length === 0) return null

  const featured = photos
    .filter((photo) => photo.featured)
    .concat(photos.filter((photo) => !photo.featured))
    .slice(0, config.featuredCount)

  return (
    <section class="komei-home-gallery" id="gallery" aria-labelledby="komei-home-gallery-title">
      <div class="komei-section-heading komei-home-gallery__heading">
        <p>{config.eyebrow}</p>
        <h2 id="komei-home-gallery-title">{config.title}</h2>
        <span>{config.description}</span>
      </div>

      <div class="komei-home-gallery__feature">
        <div class="komei-home-gallery__featured-grid" aria-label="精选照片">
          {featured.map((photo) => (
            <figure class="komei-home-gallery__featured-card">
              <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
              {config.showCaptions && <figcaption>{photo.title}</figcaption>}
            </figure>
          ))}
        </div>

        <aside class="komei-home-gallery__postcard" aria-label="相册说明">
          <p>{config.postcard.timestamp}</p>
          <h3>{config.postcard.title}</h3>
          {config.postcard.lines.map((line) => (
            <span>{line}</span>
          ))}
          <strong>{photos.length} 张照片</strong>
          {config.postcard.location && <em>{config.postcard.location}</em>}
        </aside>
      </div>

      <div class="komei-home-gallery__masonry" aria-label="全部照片">
        {photos.map((photo) => (
          <figure class="komei-home-gallery__card">
            <span class="komei-home-gallery__image-shell">
              <img
                class="komei-home-gallery__image"
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
              />
            </span>
            {config.showCaptions && (
              <figcaption class="komei-home-gallery__caption">
                <strong>{photo.title}</strong>
                {photoMeta(photo) && <span>{photoMeta(photo)}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  )
}

export default (() => HomeGallery) satisfies QuartzComponentConstructor
