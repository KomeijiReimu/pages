import path from "node:path"
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import yaml from "js-yaml"
import { komeijireimuConfig } from "../komeijireimu.config"
import type { BuildCtx } from "./ctx"
import { type FilePath, slugifyFilePath } from "./path"

const config = komeijireimuConfig.homepage.gallery
// Legacy configs use content/photos. The prefix is always relative to the CLI's -d.
const galleryRoot = () => config.sourceDir.replace(/^content\//, "").replace(/\/$/, "")
const metadataFiles = () => ["_gallery.yml", "_gallery.yaml"].map((f) => `${galleryRoot()}/${f}`)

export function isGalleryImage(fp: string) {
  return (
    config.enabled && fp.startsWith(`${galleryRoot()}/`) && /\.(avif|jpe?g|png|webp)$/i.test(fp)
  )
}

export function isGalleryInput(fp: string) {
  return isGalleryImage(fp) || (config.enabled && metadataFiles().includes(fp))
}

export const galleryWidth = 800
// Keep the source extension: sun.jpg and sun.webp are different cards.
export const galleryPreview = (fp: FilePath) => `static/gallery/${slugifyFilePath(fp)}.webp`

type PhotoMeta = {
  title?: string
  alt?: string
  date?: Date | string
  order?: number
  featured?: boolean
}

export async function loadGalleryPhotos(ctx: BuildCtx) {
  const images = ctx.allFiles.filter(isGalleryImage)
  if (!images.length) return []
  const metaPath = metadataFiles().find((fp) => ctx.allFiles.includes(fp as FilePath))
  const metadata = metaPath
    ? (
        yaml.load(await readFile(path.join(ctx.argv.directory, metaPath), "utf8")) as
          | { photos?: Record<string, PhotoMeta> }
          | undefined
      )?.photos
    : undefined

  const selected = images
    .map((fp) => {
      const relativePath = path.posix.relative(galleryRoot(), fp)
      const name = path.posix.parse(fp)
      const meta = metadata?.[relativePath] ?? metadata?.[name.base]
      const match = name.name.match(/(20\d{2})(\d{2})(\d{2})/)
      const fileDate = match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
      return {
        fp,
        relativePath,
        src: `./${galleryPreview(fp)}`,
        alt: meta?.alt ?? meta?.title ?? fileDate ?? name.name.replace(/[-_]+/g, " "),
        date:
          meta?.date instanceof Date
            ? meta.date.toISOString().slice(0, 10)
            : (meta?.date ?? fileDate ?? ""),
        order: meta?.order ?? Infinity,
        featured: meta?.featured,
      }
    })
    .sort(
      (a, b) =>
        a.order - b.order ||
        b.date.localeCompare(a.date) ||
        a.relativePath.localeCompare(b.relativePath),
    )
    .slice(0, config.maxItems)

  return Promise.all(
    selected.map(async (photo) => {
      // Read the header only; the preview retains this (EXIF-oriented) aspect ratio.
      const { autoOrient } = await sharp(path.join(ctx.argv.directory, photo.fp)).metadata()
      const width = Math.min(galleryWidth, autoOrient.width)
      return {
        ...photo,
        width,
        height: Math.max(1, Math.round((width * autoOrient.height) / autoOrient.width)),
      }
    }),
  )
}

export type GalleryPhoto = Awaited<ReturnType<typeof loadGalleryPhotos>>[number]
