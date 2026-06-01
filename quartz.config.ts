import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "KomeijiReimu的博客",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "zh-CN",
    baseUrl: "blog.komeijireimu.top",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        title: {
          name: "LXGW WenKai Screen",
          weights: [400],
        },
        header: {
          name: "Noto Serif SC",
          weights: [500, 700],
        },
        body: {
          name: "Noto Sans SC",
          weights: [400, 600],
        },
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f4fbfc",
          lightgray: "#dcecf1",
          gray: "#8eb0bd",
          darkgray: "#38505d",
          dark: "#24313a",
          secondary: "#0b73a8",
          tertiary: "#8bcfdf",
          highlight: "rgba(139, 207, 223, 0.28)",
          textHighlight: "#ffe3a388",
        },
        darkMode: {
          light: "#122029",
          lightgray: "#203642",
          gray: "#6f93a2",
          darkgray: "#d7e8ed",
          dark: "#f5fbfc",
          secondary: "#80cfff",
          tertiary: "#9fd8c7",
          highlight: "rgba(128, 207, 255, 0.18)",
          textHighlight: "#8a6a2b88",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest", lazyLoad: true }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Comment out CustomOgImages to speed up build time
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
