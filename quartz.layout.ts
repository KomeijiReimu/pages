import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import {
  isKomeiArticlePage,
  isKomeiGiscusConfigured,
  komeireimuConfig,
} from "./quartz/komeireimu.config"

const giscus = komeireimuConfig.giscus

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
        limit: komeireimuConfig.blog.recentPostLimit,
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
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
    Component.ConditionalRender({
      component: Component.Explorer(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
  ],
  right: [
    Component.ConditionalRender({
      component: Component.Graph(),
      condition: (page) => isKomeiArticlePage(page.fileData.slug),
    }),
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
      component: Component.PostCards({
        limit: komeireimuConfig.blog.recentPostLimit,
        variant: "timeline",
      }),
      condition: (page) => page.fileData.slug === "posts/index",
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
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
  ],
  right: [],
}
