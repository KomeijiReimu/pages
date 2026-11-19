declare module "*.scss" {
  const content: string
  export = content
}

// dom custom event
interface CustomEventMap {
  prenav: CustomEvent<{}>
  nav: CustomEvent<{
    url: FullSlug
    navigation?: import("./quartz/components/scripts/scrollHistory").RouteCommit
  }>
  themechange: CustomEvent<{ theme: "light" | "dark" }>
  readermodechange: CustomEvent<{ mode: "on" | "off" }>
}

type ContentIndex = Record<FullSlug, ContentDetails>
declare let fetchData: Promise<ContentIndex> | undefined
declare const loadContentIndex: () => Promise<ContentIndex>
