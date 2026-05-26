import { FullSlug, resolveRelative } from "../util/path"
import { isKomeiPostFile } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { byDateAndAlphabetical, shouldDisablePopover } from "./PageList"
import { getDate } from "./Date"

// @ts-ignore
import script from "./scripts/postIndex.inline"

type PostIndexItem = {
  href: string
  title: string
  description: string
  date: string
  tags: string[]
  noPopover: boolean
}

type Options = {
  initialCount?: number
}

const defaultDescription = "点开继续阅读正文。"

function toPostIndexItem(props: QuartzComponentProps, slug: FullSlug): PostIndexItem | undefined {
  const page = props.allFiles.find((file) => file.slug === slug)
  if (!page?.slug) return undefined

  return {
    href: resolveRelative(props.fileData.slug!, page.slug as FullSlug),
    title: page.frontmatter?.title ?? page.slug,
    description: page.frontmatter?.description ?? page.description ?? defaultDescription,
    date: page.dates ? getDate(props.cfg, page)!.toLocaleDateString(props.cfg.locale) : "",
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

function ProgressiveList({
  title,
  description,
  items,
  initialCount,
}: {
  title: string
  description: string
  items: PostIndexItem[]
  initialCount: number
}) {
  const initialItems = items.slice(0, initialCount)

  return (
    <section
      class="komei-post-index-list"
      data-komei-progressive-posts="true"
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
      <div class="komei-post-index-list__grid">{initialItems.map(renderCard)}</div>
      <div class="komei-post-index-list__sentinel" aria-hidden="true" />
      <button type="button" class="komei-post-index-list__more">
        加载更多
      </button>
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
          title="全部文章"
          description="按时间汇总文章与笔记，适合从最近更新继续阅读。"
          items={allItems}
          initialCount={initialCount}
        />
        <ProgressiveList
          title="随笔"
          description="收纳更轻量的博客、随笔和阶段性思考。"
          items={essayItems}
          initialCount={initialCount}
        />
      </div>
    )
  }

  PostIndex.afterDOMLoaded = script
  return PostIndex
}) satisfies QuartzComponentConstructor<Options | undefined>
