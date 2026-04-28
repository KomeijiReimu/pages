import { FullSlug, resolveRelative } from "../util/path"
import { getKomeiCategoryLabel, isKomeiSystemSlug, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type Options = {
  variant?: "cards" | "directory"
}

type Category = {
  name: string
  count: number
}

function collectCategories(allFiles: QuartzComponentProps["allFiles"]): Category[] {
  const counts = new Map<string, number>()

  for (const file of allFiles) {
    const slug = file.slug
    if (!slug || isKomeiSystemSlug(slug)) continue

    const segments = slug.split("/").filter((segment) => segment.length > 0)
    if (segments.length < 2) continue

    const category = segments[0]
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

export default ((opts?: Options) => {
  const CategoryOverview: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
    const categories = collectCategories(allFiles)
    const variant = opts?.variant ?? "cards"
    const copy =
      variant === "directory"
        ? komeireimuConfig.homepage.sections.categories.directory
        : komeireimuConfig.homepage.sections.categories.cards

    return (
      <section
        class={`komei-category-overview komei-category-overview--${variant}`}
        id="categories"
        aria-labelledby="komei-categories-title"
      >
        <div class="komei-section-heading">
          <p>{copy.eyebrow}</p>
          <h2 id="komei-categories-title">{copy.title}</h2>
        </div>
        {categories.length > 0 ? (
          <div class="komei-category-overview__grid">
            {categories.map((category) => {
              const label = getKomeiCategoryLabel(category.name)

              return (
                <a
                  class="komei-category-card internal"
                  href={resolveRelative(fileData.slug!, `${category.name}/index` as FullSlug)}
                  style={{ "--komei-category-accent": label.accent }}
                >
                  <span class="komei-category-card__name">{label.label}</span>
                  <span class="komei-category-card__slug">/{category.name}/</span>
                  <span class="komei-category-card__description">{label.description}</span>
                  <span class="komei-category-card__count">{category.count} 篇</span>
                </a>
              )
            })}
          </div>
        ) : (
          <p class="komei-empty-state">{komeireimuConfig.homepage.sections.categories.empty}</p>
        )}
      </section>
    )
  }

  return CategoryOverview
}) satisfies QuartzComponentConstructor<Options | undefined>
