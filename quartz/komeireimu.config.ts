import { QuartzPluginData } from "./plugins/vfile"

export type KomeiLogo = {
  kind: "mark" | "image" | "text"
  src?: string
  alt?: string
  text?: string
}

export type KomeiNavLink = {
  label: string
  href: `/${string}`
  description: string
}

export type KomeiQuickLink = {
  label: string
  href: string
  tone: string
  icon: string
  description: string
  variant?: "icon" | "pill"
  external?: boolean
  enabled?: boolean
}

export type KomeiProfileFact = {
  label: string
  value: string
  enabled?: boolean
}

export type KomeiModuleImage = {
  src: string
  alt: string
  position?: string
}

export type KomeiHomeModule = {
  key: string
  title: string
  eyebrow: string
  description: string
  items: string[]
  image?: KomeiModuleImage
}

export type KomeiHeroStat = {
  label: string
  value: string
}

export type KomeiHeroBackground = {
  src?: string
  opacity?: string
  position?: string
  size?: string
  repeat?: string
  blendMode?: string
}

export type KomeiHero = {
  eyebrow: string
  title: string
  lead: string
  purpose: string[]
  primaryAction: { label: string; href: string }
  secondaryAction: { label: string; href: string }
  stats: KomeiHeroStat[]
  background?: KomeiHeroBackground
}

export type KomeiMusicTrackLink = `/${string}` | `https://${string}`

export type KomeiMusicTrack = {
  sourceKind: "network" | "local" | "none"
  src?: string
  link?: KomeiMusicTrackLink
  title: string
  artist: string
  album?: string
  duration: string
  mood: string
  tags: readonly string[]
  lyrics?: string
  cover?: string
  active?: boolean
}

export type KomeiHomepageMusic = {
  enabled: boolean
  label: string
  coverFallback: string
  tracks: KomeiMusicTrack[]
}

export type KomeiSectionCopy = {
  eyebrow: string
  title: string
  description?: string
  actionLabel?: string
  empty?: string
}

export type KomeiCategoryLabel = {
  label: string
  description: string
  accent: string
}

export type KomeiBackground = {
  base: string
  wash: string
  primaryOrb: string
  secondaryOrb: string
  grid: string
  grainOpacity: string
  image: string
  imageOpacity: string
  imageSize: string
  imagePosition: string
  imageRepeat: string
  imageBlendMode: string
}

export const komeireimuConfig = {
  site: {
    name: "KomeijiReimu",
    subtitle: "把笔记、博客与灵感收束成一座柔软的灯塔。",
    description: "一个以 KomeijiReimu 为中心的个人博客，聚合文章、归档、标签与长期笔记。",
    logo: {
      kind: "mark",
      text: "KR",
    } as KomeiLogo,
  },
  navLinks: [
    { label: "首页", href: "/", description: "回到首页" },
    { label: "文章", href: "/posts/", description: "按时间线浏览文章" },
    { label: "归档", href: "/categories/", description: "按主题浏览归档" },
    { label: "标签", href: "/tags/", description: "浏览主题标签" },
    { label: "关于", href: "/about/", description: "查看站点与作者说明" },
  ] satisfies KomeiNavLink[],
  profile: {
    name: "KomeijiReimu",
    handle: "@komeireimu",
    avatarInitials: "KR",
    bio: "一座围绕「不动的大图书馆」构建的数字花园，收束工程笔记、灵感片段与长期思考。",
    motto: "在信息的洪流中，为知识留出一片安静的锚地。",
    facts: [
      { label: "内容", value: "文章 · 归档 · 标签" },
      { label: "主题", value: "代码、运维、阅读与记录" },
      { label: "维护", value: "持续整理长期笔记" },
    ] satisfies KomeiProfileFact[],
    links: [
      {
        label: "GitHub",
        href: "https://github.com/KomeijiReimu",
        tone: "gray",
        icon: "github",
        description: "访问 GitHub 主页",
        variant: "icon",
        external: true,
      },
      {
        label: "邮件",
        href: "",
        tone: "soft",
        icon: "mail",
        description: "邮件联系",
        variant: "icon",
      },
      {
        label: "订阅",
        href: "",
        tone: "amber",
        icon: "rss",
        description: "订阅入口",
        variant: "icon",
      },
      {
        label: "书架",
        href: "",
        tone: "leaf",
        icon: "book",
        description: "书架入口",
        variant: "icon",
      },
    ] satisfies KomeiQuickLink[],
  },
  background: {
    base: "var(--light)",
    wash: "color-mix(in srgb, var(--light) 78%, var(--lightgray) 22%)",
    primaryOrb: "color-mix(in srgb, var(--secondary) 20%, transparent)",
    secondaryOrb: "color-mix(in srgb, var(--tertiary) 24%, transparent)",
    grid: "color-mix(in srgb, var(--gray) 18%, transparent)",
    grainOpacity: "0.2",
    image: "url('/static/background (3).jpg')",
    imageOpacity: "0.18",
    imageSize: "cover",
    imagePosition: "center top",
    imageRepeat: "no-repeat",
    imageBlendMode: "soft-light",
  } satisfies KomeiBackground,
  darkBackground: {
    base: "#081219",
    wash: "#09131a",
    primaryOrb: "color-mix(in srgb, var(--secondary) 5%, transparent)",
    secondaryOrb: "color-mix(in srgb, var(--tertiary) 4%, transparent)",
    grid: "color-mix(in srgb, var(--gray) 4%, transparent)",
    grainOpacity: "0.06",
    image: "none",
    imageOpacity: "0",
    imageSize: "cover",
    imagePosition: "center",
    imageRepeat: "no-repeat",
    imageBlendMode: "normal",
  } satisfies KomeiBackground,
  blog: {
    postSlugPrefixes: ["posts", "notes"],
    excludedSlugs: ["index", "posts/index", "categories/index", "tags/index", "about/index"],
    excludedSlugPrefixes: ["tags", "categories"],
    recentPostLimit: 5,
    tagCloudLimit: 24,
  },
  categoryLabels: {
    posts: {
      label: "文章",
      description: "按时间沉淀的正式博客与更新记录。",
      accent: "var(--secondary)",
    },
    notes: {
      label: "笔记",
      description: "整理长期积累的知识库笔记与资料。",
      accent: "var(--tertiary)",
    },
    projects: {
      label: "项目",
      description: "持续整理的作品、想法与实践记录。",
      accent: "var(--komei-accent-amber)",
    },
    Code: {
      label: "Code",
      description: "算法竞赛、项目开发与编程实践。",
      accent: "var(--tertiary)",
    },
    杂类文档: {
      label: "杂类文档",
      description: "IT 工具、解决方案与零散的技术杂项。",
      accent: "var(--secondary)",
    },
    计算机原理: {
      label: "计算机原理",
      description: "操作系统、网络、计组等底层基础。",
      accent: "var(--amber)",
    },
    运维: {
      label: "运维",
      description: "服务器管理、容器、网络与安全。",
      accent: "var(--rose)",
    },
  } satisfies Record<string, KomeiCategoryLabel>,
  homepage: {
    hero: {
      eyebrow: "不动的大图书馆",
      title: "KomeijiReimu 的文章与长期笔记",
      lead: "这里收纳博客文章、主题归档与长期笔记，适合按时间阅读，也适合从目录和标签回到具体主题。",
      purpose: ["按时间阅读文章", "按目录进入归档", "用标签追踪主题"],
      primaryAction: { label: "阅读最新文章", href: "/posts/" },
      secondaryAction: { label: "浏览标签", href: "/tags/" },
      stats: [
        { label: "文章", value: "时间线阅读" },
        { label: "归档", value: "目录化整理" },
        { label: "标签", value: "横向追踪" },
      ] satisfies KomeiHeroStat[],
      background: {
        src: "/static/background (3).jpg",
        opacity: "0.16",
        position: "center",
        size: "cover",
        repeat: "no-repeat",
        blendMode: "soft-light",
      },
    },
    sections: {
      posts: {
        cards: {
          eyebrow: "最近笔记",
          title: "时间轨迹",
          description: "按发布日期回看最近写下的内容。",
          actionLabel: "继续阅读",
        },
        timeline: {
          eyebrow: "最近文章",
          title: "从这里继续读",
          description: "用日期、标题、摘要和标签组成一条清晰的阅读路径。",
          actionLabel: "",
        },
        empty: "还没有可展示的文章。",
      },
      modules: {
        eyebrow: "收藏与近况",
        title: "少量模块，收束近况与收藏",
        description: "模块区作为轻量索引，安静呈现收藏、近况与片段。",
      },
      categories: {
        cards: {
          eyebrow: "目录地图",
          title: "按目录探索",
          description: "从一个主题出发，继续回看相关内容。",
          actionLabel: "查看归档",
        },
        directory: {
          eyebrow: "归档",
          title: "归档索引",
          description: "从熟悉的主题开始，慢慢回看旧文与笔记。",
          actionLabel: "查看归档",
        },
        empty: "还没有可展示的归档。",
      },
      tags: {
        cloud: {
          eyebrow: "主题云",
          title: "用标签横向跳转",
          description: "标签把相近主题的内容串联起来，数字代表相关内容数量。",
        },
        directory: {
          eyebrow: "标签目录",
          title: "标签索引",
          description: "所有标签按使用频率与名称排序，适合快速定位主题。",
        },
        empty: "还没有可展示的标签。",
      },
    } satisfies {
      posts: {
        cards: KomeiSectionCopy
        timeline: KomeiSectionCopy
        empty: string
      }
      modules: KomeiSectionCopy
      categories: {
        cards: KomeiSectionCopy
        directory: KomeiSectionCopy
        empty: string
      }
      tags: {
        cloud: KomeiSectionCopy
        directory: KomeiSectionCopy
        empty: string
      }
    },
    modules: [
      {
        key: "skills",
        eyebrow: "技能",
        title: "工程笔记、前端与写作",
        description: "长期使用的工具和学习方向，作为阅读前的轻量索引。",
        items: ["TypeScript", "Markdown", "阅读整理", "笔记归档", "界面设计", "长期写作"],
      },
      {
        key: "devices",
        eyebrow: "设备",
        title: "陪我度过每个抉择的十字路口",
        description: "记录写作、同步与日常工具，方便回看。",
        items: ["Obsidian", "Markdown", "阅读", "归档", "写作", "同步"],
      },
      {
        key: "projects",
        eyebrow: "项目",
        title: "做一些让世界更温柔的小事",
        description: "把长期作品、阅读整理和主题归档收束成可追踪的小项目。",
        items: ["博客主题", "主题归档", "视觉系统", "阅读整理", "小型作品", "长期维护"],
      },
      {
        key: "music",
        eyebrow: "音乐",
        title: "最近常在耳畔停驻的旋律",
        description: "收纳最近循环的曲目，让播放器成为安静的唱片柜。",
        items: ["Lost Stars", "万歳千唱", "NEXUS", "Silhouette", "雨后散步"],
      },
      {
        key: "gallery",
        eyebrow: "相册",
        title: "捕捉四季变换的光景，发现细处之美",
        description: "相册模块收纳照片、截图与旅行片段。",
        items: ["城市碎片", "春日樱色", "雨天湖面", "夜间灯光", "文章封面", "读书摘录"],
        image: { src: "/static/og-image.png", alt: "相册图景预览片段", position: "center" },
      },
    ] satisfies KomeiHomeModule[],
    music: {
      enabled: true,
      label: "最近在听",
      coverFallback: "/static/og-image.png",
      tracks: [
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          title: "夜航片段 01",
          artist: "KomeijiReimu Radio",
          album: "最近循环",
          duration: "06:12",
          mood: "夜间写作",
          tags: ["写作", "夜间", "循环"],
          lyrics: "适合放在深夜整理笔记时循环。",
          cover: "/static/og-image.png",
          link: "/posts/",
          active: true,
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
          title: "午后微风",
          artist: "KomeijiReimu Radio",
          album: "最近循环",
          duration: "05:44",
          mood: "午后散步",
          tags: ["午后", "微风", "散步"],
          lyrics: "在风里慢慢走一会儿，给自己留一点呼吸。",
          cover: "/static/og-image.png",
          link: "https://www.soundhelix.com/",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
          title: "雨幕低语",
          artist: "KomeijiReimu Radio",
          album: "最近循环",
          duration: "05:02",
          mood: "雨天慢行",
          tags: ["雨天", "低速", "安静"],
          lyrics: "适合雨天慢慢翻页的背景音。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
          title: "晨间整理",
          artist: "KomeijiReimu Radio",
          album: "最近循环",
          duration: "05:23",
          mood: "晨间整理",
          tags: ["清晨", "整理", "微光"],
          lyrics: "把零散心绪收束成清爽的一天。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
          title: "页面微光",
          artist: "KomeijiReimu Radio",
          album: "最近循环",
          duration: "05:20",
          mood: "视觉收尾",
          tags: ["界面", "微光", "收尾"],
          lyrics: "留给视觉细节的最后一轮检查。",
          cover: "/static/og-image.png",
        },
      ] satisfies KomeiMusicTrack[],
    } satisfies KomeiHomepageMusic,
  },
  giscus: {
    repo: "OWNER/REPO" as `${string}/${string}`,
    repoId: "REPLACE_WITH_GISCUS_REPO_ID",
    category: "REPLACE_WITH_GISCUS_CATEGORY",
    categoryId: "REPLACE_WITH_GISCUS_CATEGORY_ID",
    mapping: "pathname" as const,
    lang: "zh-CN",
  },
} as const

export function isKomeiGiscusConfigured(): boolean {
  const giscus = komeireimuConfig.giscus
  return (
    giscus.repo !== "OWNER/REPO" &&
    !giscus.repoId.startsWith("REPLACE_WITH_") &&
    !giscus.category.startsWith("REPLACE_WITH_") &&
    !giscus.categoryId.startsWith("REPLACE_WITH_")
  )
}

export function isKomeiSystemSlug(slug: string | undefined): boolean {
  if (!slug) return true
  if (komeireimuConfig.blog.excludedSlugs.some((excludedSlug) => excludedSlug === slug)) return true
  if (slug.endsWith("/index")) return true

  return komeireimuConfig.blog.excludedSlugPrefixes.some(
    (prefix) => slug === prefix || slug.startsWith(`${prefix}/`),
  )
}

export function isKomeiArticlePage(slug: string | undefined): boolean {
  return !isKomeiSystemSlug(slug)
}

export function isKomeiPostFile(file: QuartzPluginData): boolean {
  const slug = file.slug
  if (!slug || isKomeiSystemSlug(slug)) return false

  return komeireimuConfig.blog.postSlugPrefixes.some(
    (prefix) => slug === prefix || slug.startsWith(`${prefix}/`),
  )
}

export function getKomeiCategoryLabel(category: string): KomeiCategoryLabel {
  const categoryLabels: Readonly<Record<string, KomeiCategoryLabel>> =
    komeireimuConfig.categoryLabels

  return (
    categoryLabels[category] ?? {
      label: category,
      description: "",
      accent: "var(--secondary)",
    }
  )
}
