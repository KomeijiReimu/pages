import { FullSlug, resolveRelative } from "../util/path"
import { isKomeiPostFile } from "../komeijireimu.config"
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
  variant?: "essays" | "all"
  pageSize?: number
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

function renderPostIndexIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: { label: string; href: string }
}) {
  return (
    <header class="komei-post-index__intro">
      <p>{eyebrow}</p>
      <div>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>
      {action && (
        <a class="internal komei-post-index__action" href={action.href}>
          {action.label}
        </a>
      )}
    </header>
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
  pagination = false,
  pageSize,
}: {
  title: string
  description: string
  items: PostIndexItem[]
  initialCount: number
  mode?: "cards" | "archive"
  pagination?: boolean
  pageSize?: number
}) {
  const initialItems = items.slice(0, pagination ? (pageSize ?? initialCount) : initialCount)

  return (
    <section
      class={`komei-post-index-list komei-post-index-list--${mode}`}
      data-komei-progressive-posts="true"
      data-render-mode={mode}
      data-komei-items={JSON.stringify(items)}
      data-initial-count={initialItems.length}
      data-pagination={pagination ? "true" : undefined}
      data-page-size={pagination ? String(pageSize ?? initialCount) : undefined}
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
      {pagination && items.length > initialItems.length && (
        <nav class="komei-post-index-pagination" aria-label={`${title}分页`} />
      )}
    </section>
  )
}

export default ((opts?: Options) => {
  const PostIndex: QuartzComponent = (props: QuartzComponentProps) => {
    const initialCount = opts?.initialCount ?? 10
    const pageSize = opts?.pageSize ?? 24
    const variant = opts?.variant ?? "essays"
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

    if (variant === "all") {
      return (
        <div class="komei-post-index komei-post-index--all">
          {renderPostIndexIntro({
            eyebrow: "全部文章",
            title: "完整时间线",
            description: "从新到旧，把写过的内容放在一条线上。",
            action: { label: "返回随笔", href: "/posts/" },
          })}
          <ProgressiveList
            title="文章"
            description="慢慢翻。"
            items={allItems}
            initialCount={pageSize}
            mode="archive"
            pagination
            pageSize={pageSize}
          />
        </div>
      )
    }

    return (
      <div class="komei-post-index komei-post-index--essays">
        {renderPostIndexIntro({
          eyebrow: "随笔",
          title: "随笔时间线",
          description: "这里仅展示随笔；完整目录另行进入。",
        })}
        <div class="komei-post-index__directory-entry">
          <span>需要按时间查看所有内容？</span>
          <a class="internal komei-post-index__action" href="/posts/all/">
            打开完整文章目录
          </a>
        </div>
        <ProgressiveList
          title="随笔"
          description="向下滑动查看更早的记录。"
          items={essayItems}
          initialCount={initialCount}
          mode="archive"
        />
      </div>
    )
  }

  PostIndex.afterDOMLoaded = script
  return PostIndex
}) satisfies QuartzComponentConstructor<Options | undefined>
