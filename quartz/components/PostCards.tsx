import { FullSlug, resolveRelative } from "../util/path"
import { isKomeiPostFile, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { Date, getDate } from "./Date"
import { byDateAndAlphabetical, shouldDisablePopover } from "./PageList"

type Options = {
  limit?: number
  variant?: "cards" | "timeline"
}

function getPostFiles({ allFiles, cfg }: QuartzComponentProps) {
  return allFiles.filter(isKomeiPostFile).slice().sort(byDateAndAlphabetical(cfg))
}

export default ((opts?: Options) => {
  const PostCards: QuartzComponent = (props: QuartzComponentProps) => {
    const limit = opts?.limit ?? 6
    const variant = opts?.variant ?? "cards"
    const posts = getPostFiles(props).slice(0, limit)
    const copy =
      variant === "timeline"
        ? komeireimuConfig.homepage.sections.posts.timeline
        : komeireimuConfig.homepage.sections.posts.cards
    const latestPost = posts[0]

    return (
      <section
        class={`komei-post-cards komei-post-cards--${variant}`}
        id="recent-posts"
        aria-labelledby="komei-posts-title"
      >
        <div class="komei-section-heading">
          <div>
            <p>{copy.eyebrow}</p>
            <h2 id="komei-posts-title">{copy.title}</h2>
            {copy.description && <span>{copy.description}</span>}
          </div>
          {variant === "timeline" && (
            <div class="komei-section-heading__meta" aria-label="文章时间线摘要">
              <span>{posts.length} 篇</span>
              {latestPost?.dates && (
                <span>
                  最近 · <Date date={getDate(props.cfg, latestPost)!} locale={props.cfg.locale} />
                </span>
              )}
            </div>
          )}
        </div>
        {posts.length > 0 ? (
          <div class={variant === "timeline" ? "komei-post-timeline" : undefined}>
            <div
              class={variant === "timeline" ? "komei-post-timeline__scroll" : undefined}
              data-komei-post-timeline-scroll={variant === "timeline" ? "true" : undefined}
            >
              <div class="komei-post-cards__grid">
                {posts.map((post) => {
                  const title = post.frontmatter?.title ?? post.slug
                  const description =
                    post.frontmatter?.description ??
                    post.description ??
                    "这篇笔记还没有摘要，点开看看正文内容。"
                  const tags = post.frontmatter?.tags ?? []
                  const href = resolveRelative(props.fileData.slug!, post.slug as FullSlug)

                  return (
                    <article class="komei-post-card">
                      {variant === "timeline" && (
                        <div class="komei-post-card__rail" aria-hidden="true">
                          <span />
                        </div>
                      )}
                      <div class="komei-post-card__body">
                        <p class="komei-post-card__meta">
                          {post.dates ? (
                            <Date date={getDate(props.cfg, post)!} locale={props.cfg.locale} />
                          ) : (
                            "未标注日期"
                          )}
                        </p>
                        <h3>
                          <a
                            class="internal"
                            href={href}
                            data-no-popover={shouldDisablePopover(post) ? "true" : undefined}
                          >
                            {title}
                          </a>
                        </h3>
                        <p>{description}</p>
                        {tags.length > 0 && (
                          <ul class="komei-post-card__tags">
                            {tags.slice(0, variant === "timeline" ? 2 : 3).map((tag) => (
                              <li>
                                <a
                                  class="internal tag-link"
                                  href={resolveRelative(
                                    props.fileData.slug!,
                                    `tags/${tag}` as FullSlug,
                                  )}
                                >
                                  {tag}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        {copy.actionLabel && variant !== "timeline" && (
                          <a
                            class="internal komei-post-card__readmore"
                            href={href}
                            aria-label={`${copy.actionLabel}：${title}`}
                          >
                            {copy.actionLabel}
                          </a>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <p class="komei-empty-state">{komeireimuConfig.homepage.sections.posts.empty}</p>
        )}
      </section>
    )
  }

  return PostCards
}) satisfies QuartzComponentConstructor<Options | undefined>
