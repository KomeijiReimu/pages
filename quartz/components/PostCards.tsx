import { FullSlug, resolveRelative } from "../util/path"
import { isKomeiPostFile, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { Date, getDate } from "./Date"
import { byDateAndAlphabetical } from "./PageList"

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

    return (
      <section
        class={`komei-post-cards komei-post-cards--${variant}`}
        id="recent-posts"
        aria-labelledby="komei-posts-title"
      >
        <div class="komei-section-heading">
          <p>{variant === "timeline" ? "Post timeline" : "Latest notes"}</p>
          <h2 id="komei-posts-title">{variant === "timeline" ? "文章时间线" : "最近文章"}</h2>
        </div>
        {posts.length > 0 ? (
          <div class="komei-post-cards__grid">
            {posts.map((post) => {
              const title = post.frontmatter?.title ?? post.slug
              const description =
                post.frontmatter?.description ?? "这篇笔记还没有摘要，点开看看正文内容。"
              const tags = post.frontmatter?.tags ?? []

              return (
                <article class="komei-post-card">
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
                      href={resolveRelative(props.fileData.slug!, post.slug as FullSlug)}
                    >
                      {title}
                    </a>
                  </h3>
                  <p>{description}</p>
                  {tags.length > 0 && (
                    <ul class="komei-post-card__tags">
                      {tags.slice(0, 3).map((tag) => (
                        <li>
                          <a
                            class="internal tag-link"
                            href={resolveRelative(props.fileData.slug!, `tags/${tag}` as FullSlug)}
                          >
                            {tag}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p class="komei-empty-state">
            还没有可展示的文章；请在 {komeireimuConfig.blog.postSlugPrefixes.join("、")}{" "}
            目录下新增带日期的 Markdown。
          </p>
        )}
      </section>
    )
  }

  return PostCards
}) satisfies QuartzComponentConstructor<Options | undefined>
