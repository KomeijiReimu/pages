import { FullSlug, resolveRelative } from "../util/path"
import { isKomeiPostFile } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { byDateAndAlphabetical, shouldDisablePopover } from "./PageList"
import { getDate } from "./Date"
import { Fragment } from "preact"

// @ts-ignore
import script from "./scripts/postIndex.inline"

type PostIndexItem = {
  href: string
  title: string
  description: string
  date: string
  year: string
  monthDay: string
  tags: string[]
  noPopover: boolean
}

type Options = {
  initialCount?: number
}

const defaultDescription = "点开继续阅读正文。"

function formatMonthDay(date: globalThis.Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}`
}

function toPostIndexItem(props: QuartzComponentProps, slug: FullSlug): PostIndexItem | undefined {
  const page = props.allFiles.find((file) => file.slug === slug)
  if (!page?.slug) return undefined
  const date = page.dates ? getDate(props.cfg, page) : undefined

  return {
    href: resolveRelative(props.fileData.slug!, page.slug as FullSlug),
    title: page.frontmatter?.title ?? page.slug,
    description: page.frontmatter?.description ?? page.description ?? defaultDescription,
    date: date ? date.toLocaleDateString(props.cfg.locale) : "",
    year: date ? String(date.getFullYear()) : "未标注",
    monthDay: date ? formatMonthDay(date) : "--",
    tags: page.frontmatter?.tags ?? [],
    noPopover: shouldDisablePopover(page),
  }
}

function renderCard(item: PostIndexItem) {
  return (
    <article class="komei-post-index-card">
      <p class="komei-post-index-card__meta">{item.date || "无日期"}</p>
      <h3>
        <a class="internal" href={item.href} data-no-popover={item.noPopover ? "true" : undefined}>
          {item.title}
        </a>
      </h3>
      <p>{item.description}</p>
      {item.tags.length > 0 && (
        <ul class="komei-post-index-card__tags">
          {item.tags.slice(0, 4).map((tag) => (
            <li>#{tag}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

function renderArchiveItem(item: PostIndexItem) {
  return (
    <article class="komei-post-archive-item">
      <time class="komei-post-archive-item__date">{item.monthDay}</time>
      <span class="komei-post-archive-item__node" aria-hidden="true" />
      <div class="komei-post-archive-item__body">
        <h3>
          <a
            class="internal"
            href={item.href}
            data-no-popover={item.noPopover ? "true" : undefined}
          >
            {item.title}
          </a>
        </h3>
        {item.tags.length > 0 && (
          <ul class="komei-post-archive-item__tags">
            {item.tags.slice(0, 5).map((tag) => (
              <li>#{tag}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function renderArchiveEntries(items: PostIndexItem[]) {
  let currentYear = ""

  return items.map((item) => {
    const shouldShowYear = item.year !== currentYear
    currentYear = item.year

    return (
      <Fragment>
        {shouldShowYear && (
          <div class="komei-post-archive-year" data-komei-archive-year={item.year}>
            <time>{item.year}</time>
            <span aria-hidden="true" />
          </div>
        )}
        {renderArchiveItem(item)}
      </Fragment>
    )
  })
}

function ProgressiveList({
  title,
  description,
  items,
  initialCount,
  mode = "cards",
}: {
  title: string
  description: string
  items: PostIndexItem[]
  initialCount: number
  mode?: "cards" | "archive"
}) {
  const initialItems = items.slice(0, initialCount)

  return (
    <section
      class={`komei-post-index-list komei-post-index-list--${mode}`}
      data-komei-progressive-posts="true"
      data-render-mode={mode}
      data-komei-items={JSON.stringify(items)}
      data-initial-count={initialItems.length}
    >
      <div class="komei-post-index-list__heading">
        <div>
          <p>{title}</p>
          <span>{description}</span>
        </div>
        <strong>{items.length} 篇</strong>
      </div>
      <div
        class={
          mode === "archive" ? "komei-post-index-list__archive" : "komei-post-index-list__grid"
        }
      >
        {mode === "archive" ? renderArchiveEntries(initialItems) : initialItems.map(renderCard)}
      </div>
      <div class="komei-post-index-list__sentinel" aria-hidden="true" />
    </section>
  )
}

export default ((opts?: Options) => {
  const PostIndex: QuartzComponent = (props: QuartzComponentProps) => {
    const initialCount = opts?.initialCount ?? 10
    const sortedPages = props.allFiles
      .filter(isKomeiPostFile)
      .slice()
      .sort(byDateAndAlphabetical(props.cfg))
    const allItems = sortedPages
      .map((page) => toPostIndexItem(props, page.slug as FullSlug))
      .filter((item): item is PostIndexItem => item !== undefined)
    const essayItems = sortedPages
      .filter((page) => page.slug?.startsWith("posts/") && page.slug !== "posts/index")
      .map((page) => toPostIndexItem(props, page.slug as FullSlug))
      .filter((item): item is PostIndexItem => item !== undefined)

    return (
      <div class="komei-post-index">
        <ProgressiveList
          title="随笔"
          description="更轻量的片段和阶段性思考。"
          items={essayItems}
          initialCount={initialCount}
        />
        <ProgressiveList
          title="全部文章"
          description="沿着年份和日期回看完整时间线。"
          items={allItems}
          initialCount={Math.max(initialCount, 18)}
          mode="archive"
        />
      </div>
    )
  }

  PostIndex.afterDOMLoaded = script
  return PostIndex
}) satisfies QuartzComponentConstructor<Options | undefined>
