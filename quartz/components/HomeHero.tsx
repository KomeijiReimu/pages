import { QuartzComponent, QuartzComponentConstructor } from "./types"

const HomeHero: QuartzComponent = () => {
  return (
    <section class="komei-home-hero" aria-labelledby="komei-home-title">
      <div class="komei-home-hero__eyebrow">KomeiReimu Blog</div>
      <h1 id="komei-home-title">把零散笔记安放进柔软的博客壳。</h1>
      <p>
        这里保留原有 Quartz 笔记的自由结构，同时用更接近 Fuwari
        的轻盈卡片、目录分类和顶部导航，给之后的文章沉淀留出清晰入口。
      </p>
    </section>
  )
}

export default (() => HomeHero) satisfies QuartzComponentConstructor
