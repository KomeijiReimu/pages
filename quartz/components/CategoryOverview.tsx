import { FullSlug, resolveRelative } from "../util/path"
import { getKomeiCategoryLabel, isKomeiSystemSlug, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type Options = {
  variant?: "cards" | "directory"
}

type Category = {
  name: string
  count: number
  href: FullSlug
}

function collectCategories(allFiles: QuartzComponentProps["allFiles"]): Category[] {
  const counts = new Map<string, number>()

  for (const file of allFiles) {
    const slug = file.slug
    if (!slug || isKomeiSystemSlug(slug)) continue

    const segments = slug.split("/").filter((segment) => segment.length > 0)
    if (segments[0] !== "notes" || segments.length < 3) continue

    const category = segments[1]
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  return Array.from(counts, ([name, count]) => ({
    name,
    count,
    href: `notes/${name}/index` as FullSlug,
  })).sort((left, right) => left.name.localeCompare(right.name))
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
          <div>
            <p>{copy.eyebrow}</p>
            <h2 id="komei-categories-title">{copy.title}</h2>
            {copy.description && <span>{copy.description}</span>}
          </div>
          <div class="komei-section-heading__meta" aria-label="归档摘要">
            <span>{categories.length} 组</span>
          </div>
        </div>
        {categories.length > 0 ? (
          <div class="komei-category-overview__grid">
            {categories.map((category) => {
              const label = getKomeiCategoryLabel(category.name)

              return (
                <a
                  class="komei-category-card"
                  href={resolveRelative(fileData.slug!, category.href)}
                  style={{ "--komei-category-accent": label.accent }}
                >
                  <span class="komei-category-card__name">{label.label}</span>
                  {label.description && (
                    <span class="komei-category-card__description">{label.description}</span>
                  )}
                  <span class="komei-category-card__footer">
                    <span class="komei-category-card__count">{category.count} 篇</span>
                  </span>
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
