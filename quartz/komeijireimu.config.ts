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

export type KomeiProfileAvatar = {
  src: string
  alt?: string
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
  primaryAction: { label: string; href: string }
  secondaryAction: { label: string; href: string }
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

export type KomeiHomepageGallery = {
  enabled: boolean
  sourceDir: string
  eyebrow: string
  title: string
  maxItems: number
  featuredCount: number
  postcard: {
    title: string
    lines: string[]
    location?: string
    timestamp?: string
  }
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

export const komeijireimuConfig = {
  site: {
    name: "KomeijiReimu",
    subtitle: "笔记、博客与灵感。",
    description: "KomeijiReimu 的个人博客，聚合文章、与长期笔记。",
    logo: {
      kind: "image",
      src: "/static/logo.png",
      alt: "KomeijiReimu",
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
    handle: "@brant",
    avatarInitials: "KR",
    avatar: {
      src: "/static/avatar.jpg",
      alt: "KomeijiReimu 的头像",
    } satisfies KomeiProfileAvatar,
    bio: "一座围绕「不动的大图书馆」构建的数字花园，收束工程笔记、灵感片段与长期思考。",
    motto: "知识的幻想乡。",
    facts: [] satisfies KomeiProfileFact[],
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
    imageOpacity: "0.2",
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
    excludedSlugs: [
      "index",
      "posts/index",
      "posts/all/index",
      "categories/index",
      "tags/index",
      "about/index",
    ],
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
      title: "相信的心就是你的魔法",
      lead: "把工程笔记和长期问题聚在一起，留给下一次继续思考。",
      primaryAction: { label: "阅读最新文章", href: "/posts/" },
      secondaryAction: { label: "浏览标签", href: "/tags/" },
      background: {
        src: "/static/back (2).jpg",
        opacity: "1",
        position: "center",
        size: "cover",
        repeat: "no-repeat",
        blendMode: "normal",
      },
    },
    gallery: {
      enabled: true,
      sourceDir: "content/photos",
      eyebrow: "相册",
      title: "魔法之旅",
      maxItems: 48,
      featuredCount: 4,
      postcard: {
        title: "记录时光",
        lines: ["把路过的光、树影和街角收在这里。", "主要是因为主页太空了。"],
        location: "KomeijiReimu",
        timestamp: "2026",
      },
    } satisfies KomeiHomepageGallery,
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
          description: "时间线",
          actionLabel: "",
        },
        empty: "还没有可展示的文章。",
      },
      modules: {
        eyebrow: "收藏",
        title: "个性板块",
        description: "没想好这里要放啥。",
      },
      categories: {
        cards: {
          eyebrow: "目录地图",
          title: "按目录探索",
          description: "所有归档的文件。",
          actionLabel: "查看归档",
        },
        directory: {
          eyebrow: "归档",
          title: "归档索引",
          description: "所有归档的文件。",
          actionLabel: "查看归档",
        },
        empty: "还没有可展示的归档。",
      },
      tags: {
        cloud: {
          eyebrow: "主题云",
          title: "用标签横向跳转",
          description: "",
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
      // {
      //     key: "skills",
      //     eyebrow: "技能",
      //     title: "工程笔记、前端与写作",
      //     description: "长期使用的工具和学习方向，作为阅读前的轻量索引。",
      //     items: ["TypeScript", "Markdown", "阅读整理", "笔记归档", "界面设计", "长期写作"],
      // },
      // {
      //     key: "devices",
      //     eyebrow: "设备",
      //     title: "陪我度过每个抉择的十字路口",
      //     description: "记录写作、同步与日常工具，方便回看。",
      //     items: ["Obsidian", "Markdown", "阅读", "归档", "写作", "同步"],
      // },
      // {
      //     key: "projects",
      //     eyebrow: "项目",
      //     title: "做一些让世界更温柔的小事",
      //     description: "把长期作品、阅读整理和主题归档收束成可追踪的小项目。",
      //     items: ["博客主题", "主题归档", "视觉系统", "阅读整理", "小型作品", "长期维护"],
      // },
      {
        key: "music",
        eyebrow: "音乐",
        title: "我的精选",
        description: "为了减少资源量，这里存放的都是128k的渣音质。",
        items: ["Lost Stars", "万歳千唱", "NEXUS", "Silhouette", "雨后散步"],
      },
    ] satisfies KomeiHomeModule[],
    music: {
      enabled: true,
      label: "最近在听",
      coverFallback: "/static/og-image.png",
      tracks: [
        {
          sourceKind: "local",
          src: "/static/music/张明敏 - 我的中国心.mp3",
          title: "我的中国心",
          artist: "张明敏",
          album: "“经典的东方歌曲”",
          duration: "03:08",
          mood: "",
          tags: ["写作"],
          lyrics: "",
          cover: "/static/music/张明敏 - 我的中国心.jpg",
          link: "https://music.163.com/#/song?id=195373",
          active: true,
        },
        {
          sourceKind: "local",
          src: "/static/music/酔恋花 -suirenka- - Stack.mp3",
          title: "酔恋花",
          artist: "Stack",
          album: "东方酔恋歌",
          duration: "04:14",
          mood: "",
          tags: ["写作"],
          lyrics: "",
          cover: "/static/music/酔恋花 -suirenka- - Stack.png",
          link: "https://music.163.com/#/song?id=707720",
          active: true,
        },
        {
          sourceKind: "local",
          src: "/static/music/魂音泉 - 幻灯花(feat. アリレム).mp3",
          title: "幻灯花",
          artist: "魂音泉",
          album: "LiFESICK",
          duration: "06:18",
          mood: "",
          tags: ["写作"],
          lyrics: "",
          cover: "/static/music/魂音泉 - 幻灯花(feat. アリレム).jpg",
          link: "https://music.163.com/#/song?id=40915589",
          active: true,
        },
        {
          sourceKind: "local",
          src: "/static/music/最も澄みわたる空と海.mp3",
          title: "最も澄みわたる空と海",
          artist: "",
          album: "东方梦终剧～Concealed the Conclusion～",
          duration: "05:35",
          mood: "",
          tags: ["写作"],
          lyrics: "",
          cover: "/static/music/最も澄みわたる空と海.jpg",
          link: "https://www.bilibili.com/video/BV1q7411H73c",
          active: true,
        },
        {
          sourceKind: "local",
          src: "/static/music/東方萃夢想 (Arrange) - 黄昏フロンティア 上海アリス幻樂団 .mp3",
          title: "東方萃夢想 (Arrange)",
          artist: "黄昏フロンティア/上海アリス幻樂団",
          album: "幻想曲抜萃 東方萃夢想 ORIGINAL SOUND TRACK",
          duration: "04:31",
          mood: "",
          tags: ["写作"],
          lyrics: "",
          cover: "/static/music/東方萃夢想 (Arrange) - 黄昏フロンティア 上海アリス幻樂団.jpg",
          link: "https://music.163.com/#/song?id=22766004",
          active: true,
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
  const giscus = komeijireimuConfig.giscus
  return (
    giscus.repo !== "OWNER/REPO" &&
    !giscus.repoId.startsWith("REPLACE_WITH_") &&
    !giscus.category.startsWith("REPLACE_WITH_") &&
    !giscus.categoryId.startsWith("REPLACE_WITH_")
  )
}

export function isKomeiSystemSlug(slug: string | undefined): boolean {
  if (!slug) return true
  if (komeijireimuConfig.blog.excludedSlugs.some((excludedSlug) => excludedSlug === slug))
    return true
  if (slug.endsWith("/index")) return true

  return komeijireimuConfig.blog.excludedSlugPrefixes.some(
    (prefix) => slug === prefix || slug.startsWith(`${prefix}/`),
  )
}

export function isKomeiArticlePage(slug: string | undefined): boolean {
  return !isKomeiSystemSlug(slug)
}

export function isKomeiPostFile(file: QuartzPluginData): boolean {
  const slug = file.slug
  if (!slug || isKomeiSystemSlug(slug)) return false

  return komeijireimuConfig.blog.postSlugPrefixes.some(
    (prefix) => slug === prefix || slug.startsWith(`${prefix}/`),
  )
}

export function getKomeiCategoryLabel(category: string): KomeiCategoryLabel {
  const categoryLabels: Readonly<Record<string, KomeiCategoryLabel>> =
    komeijireimuConfig.categoryLabels

  return (
    categoryLabels[category] ?? {
      label: category,
      description: "",
      accent: "var(--secondary)",
    }
  )
}
