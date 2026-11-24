import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import style from "./styles/comments.scss"
// @ts-ignore
import script from "./scripts/comments.inline"

type Options = {
  provider: "giscus"
  options: {
    repo: `${string}/${string}`
    repoId: string
    category: string
    categoryId: string
    themeUrl?: string
    lightTheme?: string
    darkTheme?: string
    mapping?: "url" | "title" | "og:title" | "specific" | "number" | "pathname"
    strict?: boolean
    reactionsEnabled?: boolean
    inputPosition?: "top" | "bottom"
    lang?: string
  }
}

function boolToStringBool(b: boolean): string {
  return b ? "1" : "0"
}

export default ((opts: Options) => {
  const Comments: QuartzComponent = ({ displayClass, fileData, cfg }: QuartzComponentProps) => {
    // check if comments should be displayed according to frontmatter
    const disableComment: boolean =
      typeof fileData.frontmatter?.comments !== "undefined" &&
      (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
    if (disableComment) {
      return <></>
    }

    const isChinese = (opts.options.lang ?? cfg.locale ?? "en").startsWith("zh")
    return (
      <section
        class={classNames(displayClass, "komei-comments")}
        aria-label={isChinese ? "评论区" : "Article discussion"}
        data-state="pending"
      >
        <div class="komei-comments__heading">
          <h2>{isChinese ? "评论区" : "Discussion"}</h2>
          <a href={`https://github.com/${opts.options.repo}/discussions`} rel="noreferrer">
            {isChinese ? "GitHub 讨论区" : "GitHub Discussions"} <span aria-hidden="true">↗</span>
          </a>
        </div>
        <p
          class="komei-comments__status"
          role="status"
          data-slow={
            isChinese
              ? "评论加载较慢，也可以前往 GitHub 查看。"
              : "Comments are taking a while. You can also read discussions on GitHub."
          }
          data-failed={
            isChinese
              ? "评论未能加载，可前往 GitHub 查看讨论。"
              : "Comments couldn’t load. You can still read discussions on GitHub."
          }
        >
          {isChinese ? "正在加载评论…" : "Loading comments…"}
        </p>
        <noscript>
          <style>
            {
              ".komei-comments[data-state=pending] :is(.giscus, .komei-comments__status) { display: none !important }"
            }
          </style>
          {isChinese ? "启用 JavaScript 后可查看评论。" : "Enable JavaScript to view comments."}
        </noscript>
        {/* client.js replaces all children of .giscus, including its loader. */}
        <div
          class="giscus"
          data-repo={opts.options.repo}
          data-repo-id={opts.options.repoId}
          data-category={opts.options.category}
          data-category-id={opts.options.categoryId}
          data-mapping={opts.options.mapping ?? "url"}
          data-strict={boolToStringBool(opts.options.strict ?? true)}
          data-reactions-enabled={boolToStringBool(opts.options.reactionsEnabled ?? true)}
          data-input-position={opts.options.inputPosition ?? "bottom"}
          data-light-theme={opts.options.lightTheme ?? "light"}
          data-dark-theme={opts.options.darkTheme ?? "dark"}
          data-theme-url={
            opts.options.themeUrl ?? `https://${cfg.baseUrl ?? "example.com"}/static/giscus`
          }
          data-lang={opts.options.lang ?? "en"}
        />
      </section>
    )
  }

  Comments.css = style
  Comments.afterDOMLoaded = script

  return Comments
}) satisfies QuartzComponentConstructor<Options>
