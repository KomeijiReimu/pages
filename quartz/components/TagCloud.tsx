import { FullSlug, getAllSegmentPrefixes, resolveRelative } from "../util/path"
import { isKomeiSystemSlug, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type Options = {
  variant?: "cloud" | "directory"
  limit?: number
}

type TagItem = {
  tag: string
  count: number
}

function collectTags(allFiles: QuartzComponentProps["allFiles"]): TagItem[] {
  const counts = new Map<string, number>()

  for (const file of allFiles) {
    if (isKomeiSystemSlug(file.slug)) continue

    for (const tag of file.frontmatter?.tags ?? []) {
      for (const segment of getAllSegmentPrefixes(tag)) {
        counts.set(segment, (counts.get(segment) ?? 0) + 1)
      }
    }
  }

  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return left.tag.localeCompare(right.tag)
  })
}

export default ((opts?: Options) => {
  const TagCloud: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
    const variant = opts?.variant ?? "cloud"
    const limit = opts?.limit ?? komeireimuConfig.blog.tagCloudLimit
    const tags = collectTags(allFiles).slice(0, limit)

    return (
      <section
        class={`komei-tag-cloud komei-tag-cloud--${variant}`}
        aria-labelledby="komei-tags-title"
      >
        <div class="komei-section-heading">
          <p>{variant === "directory" ? "Quartz tag index" : "Topic cloud"}</p>
          <h2 id="komei-tags-title">标签索引</h2>
        </div>
        {tags.length > 0 ? (
          <div class="komei-tag-cloud__items">
            {tags.map(({ tag, count }) => (
              <a
                class="internal komei-tag-pill"
                href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}
              >
                <span>#{tag}</span>
                <strong>{count}</strong>
              </a>
            ))}
          </div>
        ) : (
          <p class="komei-empty-state">
            还没有可展示的标签；给文章添加 frontmatter tags 后会自动出现。
          </p>
        )}
      </section>
    )
  }

  return TagCloud
}) satisfies QuartzComponentConstructor<Options | undefined>
