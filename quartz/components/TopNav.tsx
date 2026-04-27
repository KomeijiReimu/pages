import { FullSlug, pathToRoot, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const TopNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug!
  const homeHref = pathToRoot(slug)
  const categoryHref = `${resolveRelative(slug, "index" as FullSlug)}#categories`
  const postsHref = `${resolveRelative(slug, "index" as FullSlug)}#recent-posts`

  return (
    <nav class="komei-top-nav" aria-label="KomeiReimu 主导航">
      <a class="komei-top-nav__brand" href={homeHref}>
        <span class="komei-top-nav__mark" aria-hidden="true">
          KR
        </span>
        <span>
          <span class="komei-top-nav__title">KomeiReimu</span>
          <span class="komei-top-nav__subtitle">soft notes & blog shell</span>
        </span>
      </a>
      <div class="komei-top-nav__links">
        <a href={homeHref}>首页</a>
        <a href={postsHref}>文章</a>
        <a href={categoryHref}>分类</a>
      </div>
    </nav>
  )
}

export default (() => TopNav) satisfies QuartzComponentConstructor
