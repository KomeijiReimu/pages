import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "KomeiReimu",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "zh-CN",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        title: {
          name: "LXGW WenKai Screen",
          weights: [400, 700],
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
          light: "#fff9f3",
          lightgray: "#f1e5dc",
          gray: "#c9b8ad",
          darkgray: "#6f5c55",
          dark: "#302421",
          secondary: "#d77882",
          tertiary: "#87a68a",
          highlight: "rgba(215, 120, 130, 0.16)",
          textHighlight: "#ffe1a688",
        },
        darkMode: {
          light: "#1d1719",
          lightgray: "#3a2c30",
          gray: "#8b7477",
          darkgray: "#e7d6cf",
          dark: "#fff7ed",
          secondary: "#f2a0aa",
          tertiary: "#a8c7a5",
          highlight: "rgba(242, 160, 170, 0.18)",
          textHighlight: "#8a5a2b88",
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
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
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
        enableSiteMap: false,
        enableRSS: false,
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
