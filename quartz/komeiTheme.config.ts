import type { Theme } from "./util/theme"

export const komeiTheme = {
  fontOrigin: "local",
  cdnCaching: false,
  // Browser CSS tries these installed families, then system fallbacks. Keep
  // individual names/weights here: the build-time OG renderer consumes them too.
  typography: {
    header: { name: "Noto Serif SC", weights: [500, 700] },
    body: { name: "Noto Sans SC", weights: [400, 600] },
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
} satisfies Theme
