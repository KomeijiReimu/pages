import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { Date, getDate } from "./Date"
import { byDateAndAlphabetical } from "./PageList"

type Options = {
  limit?: number
}

function getPostFiles({ allFiles, cfg }: QuartzComponentProps) {
  return allFiles
    .filter((file) => file.slug !== "index")
    .slice()
    .sort(byDateAndAlphabetical(cfg))
}

export default ((opts?: Options) => {
  const PostCards: QuartzComponent = (props: QuartzComponentProps) => {
    const limit = opts?.limit ?? 6
    const posts = getPostFiles(props).slice(0, limit)

    return (
      <section class="komei-post-cards" id="recent-posts" aria-labelledby="komei-posts-title">
        <div class="komei-section-heading">
          <p>Latest notes</p>
          <h2 id="komei-posts-title">最近文章</h2>
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
                        <li>{tag}</li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p class="komei-empty-state">
            还没有可展示的文章卡片；保留现有首页笔记，后续新增页面会自动出现在这里。
          </p>
        )}
      </section>
    )
  }

  return PostCards
}) satisfies QuartzComponentConstructor<Options | undefined>
