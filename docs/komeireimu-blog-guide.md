---
title: KomeiReimu 博客主题指南
---

# KomeiReimu 博客主题指南

本文档记录 `/home/Brant/mysite/pages` 中 KomeiReimu Quartz 主题的当前结构。主题目标是：主页吸收 Cynosura 的浅蓝背景、居中站点头部、横向导航、资料卡、横幅、时间轨迹和模块化首页；文章、分类、标签和关于页采用更接近 Fuwari 的清晰路由；单篇文章仍保留 Quartz 的正文渲染、Graph、目录和反链能力。

## 当前约束

- 站点名：`KomeiReimu`。
- 不写入假域名；没有真实域名前不配置 `baseUrl`。
- 不启用 analytics、统计或追踪脚本，`quartz.config.ts` 中的 `analytics` 保持 `null`。
- Giscus 只保留占位值；未填入真实仓库与分类 ID 前，评论区会被条件隐藏。
- 不随意移动或删除用户笔记。原首页里的 WSL 笔记已保存在 `content/notes/wsl-command-note-preserved.md`。
- 之后的修改按用户要求自动提交，但不主动推送；提交时应排除无关的 `bun.lock`、`pnpm-lock.yaml`、`.sisyphus/`、构建输出和依赖目录。

## 主要文件

| 路径                                     | 作用                                              | 修改建议                                              |
| ---------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `quartz/komeireimu.config.ts`            | KomeiReimu 站点文案、导航、资料卡、背景、模块配置 | 优先在这里改首页文案、背景、模块、分类标签和 Giscus   |
| `quartz.layout.ts`                       | Quartz 页面组合与条件渲染                         | 只在调整首页/列表页/文章页组件位置时修改              |
| `quartz/styles/custom.scss`              | KomeiReimu 视觉系统与组件样式                     | 使用 `--komei-*` 与 Quartz theme token，不写散乱样式  |
| `quartz/components/TopNav.tsx`           | 居中站点头部与横向导航条                          | 导航项通常改配置，不直接改组件                        |
| `quartz/components/HomeHero.tsx`         | 首页资料卡与大视觉横幅                            | 由 `homepage.hero` 和 `profile` 驱动                  |
| `quartz/components/PostCards.tsx`        | 首页时间轨迹与 `/posts/` 文章时间线               | 由文章 frontmatter 与 blog 过滤规则驱动               |
| `quartz/components/CategoryOverview.tsx` | `/categories/` 目录分类卡                         | 使用 `categoryLabels` 显示名称、slug、描述和数量      |
| `quartz/components/TagCloud.tsx`         | `/tags/` 标签索引                                 | 使用 Quartz frontmatter tags                          |
| `quartz/components/HomeModules.tsx`      | 技能、设备、项目、音乐、相册等首页模块            | 由 `homepage.modules` 配置驱动                        |
| `content/index.md`                       | 首页真实路由 `/`                                  | 保持为首页，不存放无关笔记                            |
| `content/posts/index.md`                 | 文章路由 `/posts/`                                | 保留 `komei-posts-index` 类，避免 Quartz 默认列表重复 |
| `content/categories/index.md`            | 分类路由 `/categories/`                           | 保留 `komei-categories-index` 类                      |
| `content/tags/index.md`                  | 标签路由 `/tags/`                                 | 保留 `komei-tags-index` 类                            |
| `content/about/index.md`                 | 关于路由 `/about/`                                | 记录当前部署与功能约束                                |

## 视觉系统

主题颜色来自 `quartz.config.ts` 的 Quartz theme：

- 浅色模式使用淡蓝背景、深蓝灰文字、蓝色主强调和浅青辅助色。
- 深色模式使用深蓝黑背景、浅色文字、亮蓝强调和柔和青绿色。
- 字体保持中文友好：标题使用 `LXGW WenKai Screen`，正文使用 `Noto Sans SC`，代码使用 `IBM Plex Mono`。

`custom.scss` 在此基础上定义最小设计系统：

- 间距：`--komei-space-1` 到 `--komei-space-8`。
- 圆角：`--komei-radius-sm`、`--komei-radius-md`、`--komei-radius-lg`、`--komei-radius-xl`。
- 卡片：`--komei-panel`、`--komei-card`、`--komei-card-strong`、`--komei-glass`。
- 描边与阴影：`--komei-border-soft`、`--komei-border-strong`、`--komei-soft-shadow`、`--komei-shadow`。

以后新增视觉样式时，应先扩展这些 token，再在组件中使用，避免硬编码零散颜色、边距和圆角。

## 首页结构

首页现在按 Cynosura 参考图组织：

1. 居中的站点 logo、标题和副标题。
2. 宽横向导航条，链接到真实的 `/`、`/posts/`、`/categories/`、`/tags/` 和 `/about/`。
3. 第一行内容：左侧资料卡，右侧大视觉横幅；横幅含标题、说明、按钮和结构统计标签。
4. 时间轨迹区：由 `PostCards` 从 `content/posts/` 中读取真实文章。
5. 首页模块区：技能、设备、项目、音乐、相册等内容由配置驱动。
6. 目录分类和标签索引作为补充入口，保持能进入真实路由。

首页、文章列表、分类、标签和关于页通过 `body[data-slug="..."]` 的样式去掉 Quartz 默认左右侧栏占位，避免再出现 Explorer 或三栏 Quartz 外观。单篇文章不受这组规则影响，仍然可以显示 Graph、目录和反链。

## 中央配置

大多数可定制内容都在 `quartz/komeireimu.config.ts`。

### 站点信息

```ts
site: {
  name: "KomeiReimu",
  subtitle: "把笔记、博客与灵感收束成一座柔软的灯塔。",
  description: "...",
}
```

- `name` 用于 masthead 标题。
- `subtitle` 用于 masthead 副标题。
- `description` 描述主题定位。

浏览器标题仍由 `quartz.config.ts` 的 `configuration.pageTitle` 控制。

### 导航

```ts
navLinks: [
  { label: "首页", href: "/", description: "Cynosura 风格首页" },
  { label: "文章", href: "/posts/", description: "按时间线浏览文章" },
  { label: "分类", href: "/categories/", description: "按目录浏览分类" },
  { label: "标签", href: "/tags/", description: "浏览 Quartz 标签索引" },
  { label: "关于", href: "/about/", description: "查看站点与作者说明" },
]
```

规则：

1. 导航必须指向真实内容路由。
2. 使用以 `/` 开头的根相对路径。
3. 新增友链、开往、留言等页面时，先创建对应 `content/` Markdown，再添加导航。

### 资料卡

```ts
profile: {
  name: "KomeiReimu",
  handle: "@komeireimu",
  avatarInitials: "KR",
  status: "整理笔记、博客与小型作品中",
  location: "Blog lighthouse",
  bio: "...",
  socials: [
    { label: "文章", href: "/posts/", tone: "soft" },
    { label: "标签", href: "/tags/", tone: "leaf" },
    { label: "关于", href: "/about/", tone: "rose" },
  ],
}
```

- `avatarInitials` 控制资料卡头像文字。
- `socials` 目前按内部链接渲染；如果以后要外链，需要明确修改组件并记录目标。
- `tone` 映射到 `.komei-chip--leaf`、`.komei-chip--rose` 等样式。

### 背景

```ts
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
}
```

这些值由 `KomeiTheme.tsx` 注入为 CSS 变量：

- `--komei-bg-base`
- `--komei-bg-wash`
- `--komei-bg-orb-primary`
- `--komei-bg-orb-secondary`
- `--komei-bg-grid`
- `--komei-grain-opacity`
- `--komei-bg-image`
- `--komei-bg-image-opacity`
- `--komei-bg-image-size`
- `--komei-bg-image-position`
- `--komei-bg-image-repeat`
- `--komei-bg-image-blend-mode`

背景图片已支持配置。默认 `image: "none"`、`imageOpacity: "0"`，因此不会显示图片；如果要启用图片，可以把图片放在 Quartz 可处理的静态或内容资源位置，然后把 `image` 改为合法 CSS 图片值，例如 `url('/static/background.webp')`，并用 `imageOpacity` 控制透明度。添加真实图片前应记录来源与授权，不要引用不明来源资源。

### 首页横幅

```ts
homepage: {
  hero: {
    eyebrow: "KomeiReimu Quartz V3",
    title: "嗨，这里是 KomeiReimu",
    lead: "...",
    primaryAction: { label: "阅读最新文章", href: "/posts/" },
    secondaryAction: { label: "浏览标签", href: "/tags/" },
    bannerAlt: "...",
    stats: [
      { label: "结构", value: "Fuwari routes" },
      { label: "首页", value: "Cynosura mood" },
      { label: "阅读", value: "Quartz graph" },
    ],
  },
}
```

- `title` 不再使用超大溢出排版，样式已限制在横幅内。
- `bannerAlt` 用于横幅视觉块的可访问描述。
- `stats` 展示首页结构、风格来源和 Quartz 阅读支持。

### 首页模块

```ts
homepage: {
  modules: [
    {
      key: "skills",
      eyebrow: "技能",
      title: "以工程笔记为主，也记录前端与写作",
      description: "...",
      items: ["Quartz", "TypeScript", "Markdown"],
    },
  ],
}
```

已内置模块：

- `skills`：技能。
- `devices`：设备与开发环境。
- `projects`：项目。
- `music`：音乐。
- `gallery`：相册/画廊。

`key` 会变成 CSS 类名的一部分，例如 `.komei-module-card--gallery`。新增模块时请使用稳定、英文、小写的 key。

首页和列表区块标题也在配置中集中管理：`homepage.profileFacts` 控制资料卡事实标签，`homepage.sections.posts/modules/categories/tags` 控制首页时间轨迹、模块区、分类区、标签区以及 `/posts/`、`/categories/`、`/tags/` 的可见标题与空状态文案。调整这些文案时优先改配置，不要直接改组件。

### 文章、分类和标签

```ts
blog: {
  postSlugPrefixes: ["posts"],
  excludedSlugs: ["index", "posts/index", "categories/index", "tags/index", "about/index"],
  excludedSlugPrefixes: ["tags", "categories"],
  recentPostLimit: 5,
  tagCloudLimit: 24,
}
```

- 普通文章应放在 `content/posts/` 下。
- `content/posts/index.md`、`content/categories/index.md`、`content/tags/index.md` 和 `content/about/index.md` 是路由页，不会被当成文章卡片。
- 分类来自 `content/` 的一级目录，例如 `posts`、`notes`、`projects`。
- 分类卡会明确显示中文名、slug、描述和数量，避免数量被裁切或隐藏。

## Giscus、域名、RSS 和 Cloudflare Pages

Giscus 当前保持占位：

```ts
giscus: {
  repo: "OWNER/REPO",
  repoId: "REPLACE_WITH_GISCUS_REPO_ID",
  category: "REPLACE_WITH_GISCUS_CATEGORY",
  categoryId: "REPLACE_WITH_GISCUS_CATEGORY_ID",
  mapping: "pathname",
  lang: "zh-CN",
}
```

在所有字段替换为真实值之前，`isKomeiGiscusConfigured()` 返回 `false`，页面不会渲染评论区，也不会出现占位评论组件。

没有真实域名前，不配置 `baseUrl`，并保持：

```ts
Plugin.ContentIndex({
  enableSiteMap: false,
  enableRSS: false,
})
```

Cloudflare Pages 推荐设置：

| 设置             | 值                                               |
| ---------------- | ------------------------------------------------ |
| Framework preset | `None`                                           |
| Build command    | `npx quartz build`                               |
| Output directory | `public`                                         |
| Root directory   | 包含 `quartz.config.ts` 的目录                   |
| Node.js version  | Node 22 或其他满足 `package.json` engines 的版本 |

## 验证命令

从 `/home/Brant/mysite/pages` 执行：

```bash
npm run check
npm test
npx quartz build -d content -o /tmp/komeireimu-quartz-v3-visual-build --concurrency=1
```

构建后重点检查：

- `/`：应有 `komei-site-header`、`komei-top-nav`、`komei-profile-card`、`komei-home-hero__banner`、`komei-home-modules`，且没有 Explorer。
- `/posts/`：应显示文章时间线，不重复显示 Quartz 默认列表。
- `/categories/`：应显示目录分类卡，分类名、slug、描述和数量都可见。
- `/tags/`：应显示标签索引。
- `/about/`：应存在并说明当前约束。
- `/posts/komeireimu-quartz-v2/`：单篇文章可以继续显示 Graph、目录和反链。

## 排障

### 首页仍像 Quartz

检查：

1. `content/index.md` 是否存在。
2. `quartz.layout.ts` 是否在 `slug === "index"` 时渲染 `HomeHero`、`PostCards`、`HomeModules`、`CategoryOverview` 和 `TagCloud`。
3. `custom.scss` 是否被构建进 `index.css`。
4. `body[data-slug="index"]` 是否应用了隐藏左右侧栏的样式。

### 按钮文字看不见

检查 `.komei-button--primary` 和 `.komei-button--ghost` 是否仍使用高对比度 token。主按钮文字应为 `var(--light)`，幽灵按钮文字应为 `var(--dark)`。

### 分类数量或描述被裁切

检查 `.komei-category-card` 是否保持 `overflow: visible`、`min-height` 和 `.komei-category-card__count` 的胶囊样式。不要把分类卡恢复成固定低高度。

### Giscus 没有显示

这是预期行为。只有当 `repo`、`repoId`、`category` 和 `categoryId` 全部替换为真实值后，评论区才会显示。

### 标签不出现

给非路由内容页添加 frontmatter：

```md
tags:

- quartz
- blog/theme
```

路由页如 `index`、`categories/index`、`tags/index` 会被过滤，不参与首页标签云统计。
