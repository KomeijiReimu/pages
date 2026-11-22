import { FilePath, joinSegments, slugifyFilePath } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import path from "path"
import fs from "fs"
import { glob } from "../../util/glob"
import { Argv } from "../../util/ctx"
import { QuartzConfig } from "../../cfg"
import sharp from "sharp"
import { galleryPreview, galleryWidth, isGalleryImage } from "../../util/gallery"

const filesToCopy = async (argv: Argv, cfg: QuartzConfig) => {
  // glob all non MD files in content folder and copy it over
  return await glob("**", argv.directory, ["**/*.md", ...cfg.configuration.ignorePatterns], {
    includeGitignored: argv.includeGitignored,
  })
}

async function* copyFile(argv: Argv, fp: FilePath) {
  const src = joinSegments(argv.directory, fp) as FilePath

  const name = slugifyFilePath(fp)
  const dest = joinSegments(argv.output, name) as FilePath

  // ensure dir exists
  const dir = path.dirname(dest) as FilePath
  await fs.promises.mkdir(dir, { recursive: true })

  await fs.promises.copyFile(src, dest)
  yield dest
  if (isGalleryImage(fp)) {
    const preview = path.join(argv.output, galleryPreview(fp)) as FilePath
    await fs.promises.mkdir(path.dirname(preview), { recursive: true })
    await sharp(src)
      .autoOrient()
      .resize({ width: galleryWidth, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(preview)
    yield preview
  }
}

export const Assets: QuartzEmitterPlugin = () => {
  return {
    name: "Assets",
    async *emit({ argv, cfg }) {
      const fps = await filesToCopy(argv, cfg)
      for (const fp of fps) {
        yield* copyFile(argv, fp)
      }
    },
    async *partialEmit(ctx, _content, _resources, changeEvents) {
      for (const changeEvent of changeEvents) {
        const ext = path.extname(changeEvent.path)
        if (ext === ".md") continue

        if (changeEvent.type === "add" || changeEvent.type === "change") {
          yield* copyFile(ctx.argv, changeEvent.path)
        } else if (changeEvent.type === "delete") {
          const name = slugifyFilePath(changeEvent.path)
          const dest = joinSegments(ctx.argv.output, name) as FilePath
          await fs.promises.unlink(dest)
          if (isGalleryImage(changeEvent.path)) {
            await fs.promises.rm(path.join(ctx.argv.output, galleryPreview(changeEvent.path)), {
              force: true,
            })
          }
        }
      }
    },
  }
}
