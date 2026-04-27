import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type Category = {
  name: string
  count: number
}

function collectCategories(allFiles: QuartzComponentProps["allFiles"]): Category[] {
  const counts = new Map<string, number>()

  for (const file of allFiles) {
    const slug = file.slug
    if (!slug || slug === "index") continue

    const segments = slug.split("/").filter((segment) => segment.length > 0)
    if (segments.length < 2) continue

    const category = segments[0]
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

const CategoryOverview: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
  const categories = collectCategories(allFiles)

  return (
    <section
      class="komei-category-overview"
      id="categories"
      aria-labelledby="komei-categories-title"
    >
      <div class="komei-section-heading">
        <p>Directory map</p>
        <h2 id="komei-categories-title">目录分类</h2>
      </div>
      {categories.length > 0 ? (
        <div class="komei-category-overview__grid">
          {categories.map((category) => (
            <a
              class="komei-category-card internal"
              href={resolveRelative(fileData.slug!, `${category.name}/index` as FullSlug)}
            >
              <span class="komei-category-card__name">{category.name}</span>
              <span class="komei-category-card__count">{category.count} 篇</span>
            </a>
          ))}
        </div>
      ) : (
        <p class="komei-empty-state">当前内容还很轻，新增目录下的笔记后会自动在这里汇总分类。</p>
      )}
    </section>
  )
}

export default (() => CategoryOverview) satisfies QuartzComponentConstructor
