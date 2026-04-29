import { QuartzPluginData } from "./plugins/vfile"

export type KomeiNavLink = {
  label: string
  href: `/${string}`
  description: string
}

export type KomeiSocialLink = {
  label: string
  href: string
  tone: string
  icon: string
  description: string
}

export type KomeiProfileFact = {
  label: string
  value: string
}

export type KomeiHomeModule = {
  key: string
  title: string
  eyebrow: string
  description: string
  items: string[]
}

export type KomeiHeroStat = {
  label: string
  value: string
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
  label: string
  coverFallback: string
  tracks: [KomeiMusicTrack, ...KomeiMusicTrack[]]
}

export type KomeiSectionCopy = {
  eyebrow: string
  title: string
  empty?: string
}

export type KomeiCategoryLabel = {
  label: string
  description: string
  accent: string
}

export const komeireimuConfig = {
  site: {
    name: "KomeiReimu",
    subtitle: "把笔记、博客与灵感收束成一座柔软的灯塔。",
    description:
      "一个以 KomeiReimu 为中心的 Cynosura/Fuwari 风格博客主题，首页、文章、分类、标签和关于页都拥有清晰入口，文章页继续保留 Quartz 深度阅读能力。",
  },
  navLinks: [
    { label: "首页", href: "/", description: "Cynosura 风格首页" },
    { label: "文章", href: "/posts/", description: "按时间线浏览文章" },
    { label: "分类", href: "/categories/", description: "按目录浏览分类" },
    { label: "标签", href: "/tags/", description: "浏览 Quartz 标签索引" },
    { label: "关于", href: "/about/", description: "查看站点与作者说明" },
  ] satisfies KomeiNavLink[],
  profile: {
    name: "KomeiReimu",
    handle: "@komeireimu",
    avatarInitials: "KR",
    badge: "Now writing",
    status: "整理笔记、博客与小型作品中",
    location: "Blog lighthouse",
    bio: "把工程笔记、灵感片段和博客文章放进一个可浏览、可归档、可继续生长的空间。",
    motto: "低噪声地记录，高密度地生活。",
    facts: [
      { label: "当前状态", value: "主题打磨 / 笔记迁移" },
      { label: "创作坐标", value: "Cloudflare Pages · Quartz v4" },
      { label: "长期偏好", value: "温柔界面、清晰路线、可复用系统" },
    ] satisfies KomeiProfileFact[],
    socials: [
      { label: "文章", href: "/posts/", tone: "soft", icon: "✦", description: "阅读最新文章" },
      { label: "标签", href: "/tags/", tone: "leaf", icon: "#", description: "浏览标签索引" },
      {
        label: "分类",
        href: "/categories/",
        tone: "amber",
        icon: "⌘",
        description: "查看目录分类",
      },
      {
        label: "关于",
        href: "/about/",
        tone: "rose",
        icon: "♡",
        description: "查看作者与站点说明",
      },
    ] satisfies KomeiSocialLink[],
  },
  background: {
    base: "var(--light)",
    wash: "color-mix(in srgb, var(--light) 78%, var(--lightgray) 22%)",
    primaryOrb: "color-mix(in srgb, var(--secondary) 20%, transparent)",
    secondaryOrb: "color-mix(in srgb, var(--tertiary) 24%, transparent)",
    grid: "color-mix(in srgb, var(--gray) 18%, transparent)",
    grainOpacity: "0.2",
    image: "none",
    imageOpacity: "0",
    imageSize: "cover",
    imagePosition: "center",
    imageRepeat: "no-repeat",
    imageBlendMode: "normal",
  },
  blog: {
    postSlugPrefixes: ["posts"],
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
      description: "保留原始知识库笔记与迁移后的资料。",
      accent: "var(--tertiary)",
    },
    projects: {
      label: "项目",
      description: "可逐步扩展的作品、实验与开发记录。",
      accent: "var(--komei-accent-amber)",
    },
  } satisfies Record<string, KomeiCategoryLabel>,
  homepage: {
    hero: {
      eyebrow: "KomeiReimu Quartz V3",
      title: "嗨，这里是 KomeiReimu",
      lead: "在浅蓝色的博客空间里整理技术、生活、项目和灵感；首页像 Cynosura 一样先给出站点人格，结构像 Fuwari 一样清晰可进入。",
      primaryAction: { label: "阅读最新文章", href: "/posts/" },
      secondaryAction: { label: "浏览标签", href: "/tags/" },
      bannerAlt: "浅蓝博客横幅：云、星轨与笔记卡片交叠的视觉块",
      stats: [
        { label: "结构", value: "Fuwari routes" },
        { label: "首页", value: "Cynosura mood" },
        { label: "阅读", value: "Quartz graph" },
      ] satisfies KomeiHeroStat[],
    },
    profileFacts: {
      status: "状态",
      location: "位置",
    },
    sections: {
      posts: {
        cards: { eyebrow: "最近笔记", title: "时间轨迹" },
        timeline: { eyebrow: "文章时间线", title: "文章时间线" },
        empty: "还没有可展示的文章；请在 content/posts/ 目录下新增带日期的 Markdown。",
      },
      modules: {
        eyebrow: "首页收藏",
        title: "技能、设备、项目、音乐与相册",
      },
      categories: {
        cards: { eyebrow: "目录地图", title: "目录分类" },
        directory: { eyebrow: "目录路由", title: "目录分类" },
        empty: "当前内容还很轻，新增目录下的笔记后会自动在这里汇总分类。",
      },
      tags: {
        cloud: { eyebrow: "主题云", title: "标签索引" },
        directory: { eyebrow: "标签目录", title: "标签索引" },
        empty: "还没有可展示的标签；给文章添加 frontmatter tags 后会自动出现。",
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
        title: "以工程笔记为主，也记录前端与写作",
        description: "这里展示长期使用的工具和学习方向，所有条目都可以在配置中替换。",
        items: ["Quartz", "TypeScript", "Markdown", "Cloudflare Pages", "笔记整理", "主题打磨"],
      },
      {
        key: "devices",
        eyebrow: "设备",
        title: "陪我度过每个抉择的十字路口",
        description: "记录写作、开发、同步和部署环境，避免部署时只剩零散记忆。",
        items: ["WSL", "Obsidian", "Node 22", "Git", "VS Code", "静态构建"],
      },
      {
        key: "projects",
        eyebrow: "项目",
        title: "做一些让世界更温柔的小事",
        description: "把博客主题、迁移记录、知识分类和部署流程整理成可追踪的小项目。",
        items: ["博客主题", "笔记迁移", "知识分类", "部署流程", "组件修复", "视觉系统"],
      },
      {
        key: "music",
        eyebrow: "音乐",
        title: "最近常在耳畔停驻的旋律",
        description: "最近循环的曲目、专辑封面和播放列表在这里汇合。",
        items: ["Lost Stars", "万歳千唱", "NEXUS", "Silhouette", "雨后散步"],
      },
      {
        key: "gallery",
        eyebrow: "相册",
        title: "捕捉四季变换的光景，发现细处之美",
        description: "相册模块用拼贴卡片模拟照片墙，之后可替换成真实图片、截图或旅行记录。",
        items: ["城市碎片", "春日樱色", "雨天湖面", "夜间灯光", "文章封面", "读书摘录"],
      },
    ] satisfies KomeiHomeModule[],
    music: {
      label: "最近在听",
      coverFallback: "/static/og-image.png",
      tracks: [
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          title: "夜航片段 01",
          artist: "KomeiReimu Radio",
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
          title: "部署后的风",
          artist: "KomeiReimu Radio",
          album: "最近循环",
          duration: "05:44",
          mood: "部署复盘",
          tags: ["复盘", "部署", "散步"],
          lyrics: "构建结束后，给自己留一点呼吸。",
          cover: "/static/og-image.png",
          link: "https://www.soundhelix.com/",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
          title: "雨幕调试",
          artist: "KomeiReimu Radio",
          album: "最近循环",
          duration: "05:02",
          mood: "雨天调试",
          tags: ["雨天", "调试", "低速"],
          lyrics: "适合慢慢排查问题的背景音。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
          title: "晨间提交",
          artist: "KomeiReimu Radio",
          album: "最近循环",
          duration: "05:23",
          mood: "晨间整理",
          tags: ["清晨", "提交", "整理"],
          lyrics: "把零散修改收束成清爽的一天。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "network",
          src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
          title: "页面微光",
          artist: "KomeiReimu Radio",
          album: "最近循环",
          duration: "05:20",
          mood: "视觉收尾",
          tags: ["界面", "微光", "收尾"],
          lyrics: "留给视觉细节的最后一轮检查。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "none",
          title: "雨后散步（待补音源）",
          artist: "KomeiReimu memo",
          album: "展示条目",
          duration: "--:--",
          mood: "仅展示",
          tags: ["unavailable", "display-only"],
          lyrics: "这首曲目没有配置 src，因此只能展示信息，播放器会禁用播放按钮。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "none",
          title: "樱色车站（待补音源）",
          artist: "KomeiReimu memo",
          album: "展示条目",
          duration: "--:--",
          mood: "展示条目",
          tags: ["future", "display-only"],
          lyrics: "先保留封面和文字，等本地或网络音源补齐后再启用播放。",
          cover: "/static/og-image.png",
        },
        {
          sourceKind: "none",
          title: "冬夜备忘（待补音源）",
          artist: "KomeiReimu memo",
          album: "展示条目",
          duration: "--:--",
          mood: "展示条目",
          tags: ["memo", "display-only"],
          lyrics: "用于记录之后想放进歌单的曲目位置。",
          cover: "/static/og-image.png",
        },
      ] satisfies [KomeiMusicTrack, ...KomeiMusicTrack[]],
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
      description: "来自 content/ 下的目录分类。",
      accent: "var(--secondary)",
    }
  )
}
