import { FullSlug, resolveRelative } from "../util/path"
import {
  getKomeiCategoryLabel,
  isKomeiSystemSlug,
  komeijireimuConfig,
} from "../komeijireimu.config"
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
        ? komeijireimuConfig.homepage.sections.categories.directory
        : komeijireimuConfig.homepage.sections.categories.cards

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
            {categories.map((category, index) => {
              const label = getKomeiCategoryLabel(category.name)

              return (
                <a
                  class="komei-category-card"
                  href={resolveRelative(fileData.slug!, category.href)}
                  style={{ "--komei-category-accent": label.accent }}
                >
                  <span class="komei-category-card__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span class="komei-category-card__name">{label.label}</span>
                  {label.description && (
                    <span class="komei-category-card__description">{label.description}</span>
                  )}
                  <span class="komei-category-card__footer">
                    <span class="komei-category-card__count">{category.count} 篇</span>
                    <span class="komei-category-card__open" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M5 12h14" />
                        <path d="m14 7 5 5-5 5" />
                      </svg>
                    </span>
                  </span>
                </a>
              )
            })}
          </div>
        ) : (
          <p class="komei-empty-state">{komeijireimuConfig.homepage.sections.categories.empty}</p>
        )}
      </section>
    )
  }

  return CategoryOverview
}) satisfies QuartzComponentConstructor<Options | undefined>
