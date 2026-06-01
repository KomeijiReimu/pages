import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import {
  isKomeiArticlePage,
  isKomeiGiscusConfigured,
  komeijireimuConfig,
} from "./quartz/komeijireimu.config"

const giscus = komeijireimuConfig.giscus

const ArticleExplorer = Component.Explorer({
  folderDefaultState: "open",
  filterFn: (node) => {
    const slug = node.slug
    return (
      slug === "notes/index" ||
      slug.startsWith("notes/") ||
      slug === "posts/index" ||
      (slug.startsWith("posts/") && !slug.startsWith("posts/all/"))
    )
  },
  mapFn: (node) => {
    if (node.slugSegment === "notes") node.displayName = "归档"
    if (node.slugSegment === "posts") node.displayName = "随笔"
  },
  sortFn: (a, b) => {
    const topOrder: Record<string, number> = { notes: 0, posts: 1 }
    const aTop = topOrder[a.slugSegment]
    const bTop = topOrder[b.slugSegment]
    if (aTop !== undefined || bTop !== undefined) return (aTop ?? 99) - (bTop ?? 99)
    if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
      return a.displayName.localeCompare(b.displayName, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      })
    }
    return a.isFolder ? -1 : 1
  },
})

const GiscusComments = Component.Comments({
  provider: "giscus",
  options: {
    repo: giscus.repo,
    repoId: giscus.repoId,
    category: giscus.category,
    categoryId: giscus.categoryId,
    mapping: giscus.mapping,
    strict: true,
    reactionsEnabled: true,
    inputPosition: "bottom",
    lightTheme: "light",
    darkTheme: "dark",
    lang: giscus.lang,
  },
})

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.KomeiTheme(), Component.TopNav(), Component.FloatingControls()],
  afterBody: [
    Component.ConditionalRender({
      component: GiscusComments,
      condition: (page) => isKomeiGiscusConfigured() && isKomeiArticlePage(page.fileData.slug),
    }),
  ],
  footer: Component.Footer({
    icp: {
      text: "辽ICP备2026010358号-1",
      href: "https://beian.miit.gov.cn/",
    },
    links: {
      首页: "/",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.HomeHero(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.PostCards({
        limit: komeijireimuConfig.blog.recentPostLimit,
        variant: "timeline",
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.CategoryOverview(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.TagCloud(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.HomeModules(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.HomeGallery(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.PostIndex({ variant: "all", pageSize: 24 }),
      condition: (page) => page.fileData.slug === "posts/all/index",
    }),
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
    Component.ConditionalRender({
      component: Component.TagList(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.ConditionalRender({
      component: ArticleExplorer,
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
  ],
  right: [
    Component.ConditionalRender({
      component: Component.DesktopOnly(Component.TableOfContents()),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.ConditionalRender({
      component: Component.PostIndex({ initialCount: 10 }),
      condition: (page) => page.fileData.slug === "posts/index",
    }),
    Component.ConditionalRender({
      component: Component.PostIndex({ variant: "all", pageSize: 24 }),
      condition: (page) => page.fileData.slug === "posts/all/index",
    }),
    Component.ConditionalRender({
      component: Component.CategoryOverview({ variant: "directory" }),
      condition: (page) => page.fileData.slug === "categories/index",
    }),
    Component.ConditionalRender({
      component: Component.TagCloud({ variant: "directory" }),
      condition: (page) => page.fileData.slug === "tags/index",
    }),
  ],
  left: [Component.PageTitle(), Component.MobileOnly(Component.Spacer())],
  right: [],
}
