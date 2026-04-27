import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

const giscusRepo = "OWNER/REPO"
const giscusRepoId = "REPLACE_WITH_GISCUS_REPO_ID"
const giscusCategory = "REPLACE_WITH_GISCUS_CATEGORY"
const giscusCategoryId = "REPLACE_WITH_GISCUS_CATEGORY_ID"
const giscusThemeUrl = "https://REPLACE_WITH_SITE_DOMAIN/static/giscus"
const giscusIsConfigured =
  giscusRepo !== "OWNER/REPO" &&
  !giscusRepoId.startsWith("REPLACE_WITH_") &&
  !giscusCategory.startsWith("REPLACE_WITH_") &&
  !giscusCategoryId.startsWith("REPLACE_WITH_")

const GiscusComments = Component.Comments({
  provider: "giscus",
  options: {
    repo: giscusRepo,
    repoId: giscusRepoId,
    category: giscusCategory,
    categoryId: giscusCategoryId,
    mapping: "pathname",
    strict: true,
    reactionsEnabled: true,
    inputPosition: "bottom",
    lightTheme: "light",
    darkTheme: "dark",
    themeUrl: giscusThemeUrl,
    lang: "zh-CN",
  },
})

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.TopNav()],
  afterBody: [
    Component.ConditionalRender({
      component: GiscusComments,
      condition: () => giscusIsConfigured,
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
      component: Component.PostCards({ limit: 6 }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.CategoryOverview(),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
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
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [],
}
