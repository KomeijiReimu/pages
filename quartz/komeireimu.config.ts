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
}

export type KomeiHomeModule = {
  key: string
  title: string
  eyebrow: string
  description: string
  items: string[]
}

export type KomeiCategoryLabel = {
  label: string
  description: string
  accent: string
}

export const komeireimuConfig = {
  site: {
    name: "KomeiReimu",
    subtitle: "Cynosura notes · Fuwari routes",
    description:
      "一个以 KomeiReimu 为中心的 Quartz V2 博客壳，保留文章阅读能力，也给首页、分类、标签和关于页清晰入口。",
  },
  navLinks: [
    { label: "首页", href: "/", description: "Cynosura-inspired landing" },
    { label: "文章", href: "/posts/", description: "Timeline of dated posts" },
    { label: "分类", href: "/categories/", description: "Directory-style categories" },
    { label: "标签", href: "/tags/", description: "Quartz tag index" },
    { label: "关于", href: "/about/", description: "Profile and site notes" },
  ] satisfies KomeiNavLink[],
  profile: {
    name: "KomeiReimu",
    handle: "@komeireimu",
    avatarInitials: "KR",
    status: "整理笔记、博客与小型作品中",
    location: "Quartz garden",
    bio: "把工程笔记、灵感片段和博客文章放进同一个柔软但清晰的空间。",
    socials: [
      { label: "RSS later", href: "/posts/", tone: "soft" },
      { label: "Tags", href: "/tags/", tone: "leaf" },
      { label: "About", href: "/about/", tone: "rose" },
    ] satisfies KomeiSocialLink[],
  },
  background: {
    base: "var(--light)",
    wash: "color-mix(in srgb, var(--light) 84%, var(--lightgray) 16%)",
    primaryOrb: "color-mix(in srgb, var(--secondary) 24%, transparent)",
    secondaryOrb: "color-mix(in srgb, var(--tertiary) 22%, transparent)",
    grid: "color-mix(in srgb, var(--gray) 13%, transparent)",
    grainOpacity: "0.34",
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
      eyebrow: "KomeiReimu Quartz V2",
      title: "把笔记星图收束成一座柔软的博客灯塔。",
      lead: "首页吸收 Cynosura 的视觉焦点，文章结构借鉴 Fuwari 的清晰导航；Quartz 的图谱、标签和反链继续服务深度阅读。",
      primaryAction: { label: "阅读最新文章", href: "/posts/" },
      secondaryAction: { label: "浏览标签", href: "/tags/" },
    },
    modules: [
      {
        key: "skills",
        eyebrow: "Skills",
        title: "技能栈",
        description: "把长期使用的工具和学习方向放在首页，方便后续快速替换。",
        items: ["Quartz", "TypeScript", "Markdown", "Cloudflare Pages"],
      },
      {
        key: "devices",
        eyebrow: "Devices",
        title: "设备与环境",
        description: "记录写作、开发、同步和部署相关设备。",
        items: ["WSL", "Obsidian", "Node 22", "Git"],
      },
      {
        key: "projects",
        eyebrow: "Projects",
        title: "项目切片",
        description: "给未来项目、图库、音乐或友链模块预留稳定入口。",
        items: ["博客主题", "笔记迁移", "知识分类", "部署流程"],
      },
      {
        key: "gallery",
        eyebrow: "Gallery",
        title: "灵感画廊",
        description: "可替换为照片、截图、音乐或阅读清单。",
        items: ["UI mood", "文章封面", "音乐碎片", "读书摘录"],
      },
    ] satisfies KomeiHomeModule[],
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
