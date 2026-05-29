---
title: KomeijiReimu 博客使用指南
---

# KomeijiReimu 博客使用指南

KomeijiReimu 博客主题基于 Quartz 构建，面向个人文章、长期笔记、主题归档和轻量作品展示。站点名称、首页文案、导航、背景、Logo、音乐播放器、快捷入口和首页模块均由集中配置驱动。日常定制优先修改 `quartz/komeireimu.config.ts`，只有新增组件结构或改变页面布局时才需要改动代码。

## 配置入口总览

| 配置区域           | 作用                          | 常用场景                         |
| ------------------ | ----------------------------- | -------------------------------- |
| `site`             | 站点名称、副标题、描述和 Logo | 修改站点身份、替换 Logo          |
| `navLinks`         | 顶部导航                      | 新增友链、留言、项目页           |
| `profile`          | 首页资料卡和快捷入口          | 修改署名、简介、GitHub 等入口    |
| `background`       | 浅色模式背景                  | 改背景色、背景图片、网格透明度   |
| `darkBackground`   | 深色模式背景                  | 给暗色模式配置独立背景图和配色   |
| `homepage.hero`    | 首页横幅文案、按钮和统计标签  | 替换首页主文案和行动按钮         |
| `homepage.modules` | “收藏与近况”卡片              | 配置卡片标题、条目、点缀图片     |
| `homepage.music`   | 音乐播放器                    | 启用/关闭播放器、配置曲目和封面  |
| `categoryLabels`   | 归档页主题名称与描述          | 给 `notes/` 一级目录设置展示文案 |
| `blog`             | 文章流纳入范围                | 调整 `posts`、`notes` 的收录规则 |

## 站点身份配置

站点身份由 `site` 与 `quartz.config.ts` 共同控制。浏览器标题使用 `quartz.config.ts` 的 `configuration.pageTitle`，当前主标题为“**不动的大图书馆**”。页面内展示的署名、站点名称和副标题来自 `quartz/komeireimu.config.ts`。

```ts
site: {
  name: "KomeijiReimu",
  subtitle: "把笔记、博客与灵感收束成一座柔软的灯塔。",
  description: "一个以 KomeijiReimu 为中心的个人博客，聚合文章、归档、标签与长期笔记。",
  logo: {
    kind: "mark",
    text: "KR",
  },
}
```

### Logo 类型

`site.logo` 支持三种形式：

```ts
// 使用主题内置标识
logo: { kind: "mark", text: "KR" }

// 使用文字标识
logo: { kind: "text", text: "Library" }

// 使用图片标识
logo: {
  kind: "image",
  src: "/static/logo.webp",
  alt: "不动的大图书馆 Logo",
}
```

图片文件建议放在 `quartz/static/` 或可被站点直接访问的公开资源目录中，并使用以 `/static/` 开头的路径。图片为空时不会渲染 `<img>`，因此不会出现裂图。

## 首页资料卡与快捷入口

首页左侧资料卡由 `profile` 配置。简介、标语、信息块和入口卡片都可以直接替换。

```ts
profile: {
  name: "KomeijiReimu",
  handle: "@komeireimu",
  avatarInitials: "KR",
  badge: "Now writing",
  bio: "一座围绕「不动的大图书馆」构建的数字花园，收束工程笔记、灵感片段与长期思考。",
  motto: "在信息的洪流中，为知识留出一片安静的锚地。",
  facts: [
    { label: "内容", value: "文章 · 归档 · 标签" },
    { label: "主题", value: "代码、运维、阅读与记录" },
    { label: "维护", value: "持续整理长期笔记" },
  ],
  links: [
    {
      label: "GitHub",
      href: "https://github.com/KomeijiReimu",
      tone: "gray",
      icon: "github",
      description: "访问 GitHub 仓库",
      external: true,
    },
    { label: "文章", href: "/posts/", tone: "soft", icon: "book", description: "阅读最新文章" },
    { label: "归档", href: "/categories/", tone: "amber", icon: "archive", description: "按目录浏览知识" },
    { label: "标签", href: "/tags/", tone: "leaf", icon: "tag", description: "按标签追踪主题" },
  ],
}
```

`profile.links` 替代固定的“文章 / 标签 / 归档 / 关于”入口。每个入口支持：

- `label`：卡片文字。
- `href`：站内路径或 HTTPS 外链。
- `description`：无障碍标签和悬停说明。
- `icon`：图标键或普通字符。
- `tone`：视觉色调，对应 `.komei-profile-link--*`。
- `external`：外链设为 `true` 后会自动添加 `target="_blank"` 和 `rel="noreferrer"`。

内置图标键包括 `github`、`mail`、`archive`、`book`、`rss`、`tag` 和 `home`。未知图标会作为普通文本渲染，适合使用 Emoji 或单字标识。RSS 入口只有在站点真实生成订阅文件后才应加入默认链接。

## 首页横幅文案

首页右侧横幅由 `homepage.hero` 配置。这里承载首页主标题、说明文字、两个按钮和底部统计标签。

```ts
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
    ],
  },
}
```

`purpose` 和 `stats` 应使用短句，避免与按钮重复。若站点定位改变，只需替换这一段配置，不需要修改 `HomeHero.tsx`。

## 视觉主题与背景图片

浅色和深色背景分别由 `background`、`darkBackground` 控制。两者会被注入为 `--komei-bg-*` CSS 变量。

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

启用背景图片时使用合法 CSS 图片值：

```ts
background: {
  ...,
  image: "url('/static/background.webp')",
  imageOpacity: "0.18",
  imageSize: "cover",
  imagePosition: "center top",
  imageRepeat: "no-repeat",
  imageBlendMode: "soft-light",
}
```

深色模式可以使用独立图片和透明度，避免浅色背景图在暗色模式下过亮。首页横幅的太阳装饰会在深色模式中呈现月亮视觉；全站深浅色切换按钮本身也会在暗色模式显示月亮图标。

## 音乐播放器配置

音乐播放器由 `homepage.music` 控制。`enabled` 为 `false` 时隐藏音乐模块；`tracks` 为空时也不会渲染播放器。

```ts
music: {
  enabled: true,
  label: "最近在听",
  coverFallback: "/static/og-image.png",
  tracks: [
    {
      sourceKind: "network",
      src: "https://example.com/song.mp3",
      title: "曲目名称",
      artist: "艺术家",
      album: "专辑名",
      duration: "03:45",
      mood: "夜间写作",
      tags: ["写作", "循环"],
      lyrics: "曲目说明或歌词摘录。",
      cover: "/static/music-cover.webp",
      link: "https://example.com/album",
      active: true,
    },
  ],
}
```

曲目来源规则：

- `sourceKind: "network"`：`src` 必须是 HTTPS 音频地址。
- `sourceKind: "local"`：`src` 使用站内资源路径，例如 `/static/music/song.mp3`。
- `sourceKind: "none"`：只展示曲目信息，不启用播放按钮。

没有真实音源时可以把 `enabled` 设为 `false`，页面不会显示开发占位文字。

## “收藏与近况”模块

首页模块由 `homepage.modules` 数组驱动。每张卡片支持标题、说明、条目和可选图片点缀。

```ts
modules: [
  {
    key: "skills",
    eyebrow: "技能",
    title: "工程笔记、前端与写作",
    description: "长期使用的工具和学习方向，作为阅读前的轻量索引。",
    items: ["TypeScript", "Markdown", "界面设计"],
  },
  {
    key: "gallery",
    eyebrow: "相册",
    title: "捕捉四季变换的光景",
    description: "相册模块收纳照片、截图与旅行片段。",
    items: ["城市碎片", "文章封面", "读书摘录"],
    image: {
      src: "/static/og-image.png",
      alt: "相册图景预览片段",
      position: "top right",
    },
  },
]
```

图片是低透明度装饰，不参与主要内容理解。没有 `image` 时卡片保持纯文字样式，不会出现空图片占位。

## 顶部导航与交互动效

顶部导航来自 `navLinks`：

```ts
navLinks: [
  { label: "首页", href: "/", description: "回到首页" },
  { label: "文章", href: "/posts/", description: "按时间线浏览文章" },
  { label: "归档", href: "/categories/", description: "按主题浏览归档" },
  { label: "标签", href: "/tags/", description: "浏览主题标签" },
  { label: "关于", href: "/about/", description: "查看站点与作者说明" },
]
```

导航动画采用事件委托实现。点击站内导航时，当前链接进入 `is-navigating` 状态，导航完成后当前页面链接短暂播放 `is-active-transition`。监听器只绑定一次，不会随 SPA 导航重复添加。动画只作用于导航链接本身，不扫描正文，也不进入长文档滚动热路径。

## 资源路径规范

- 站点公共图片建议放在 `quartz/static/`，构建后通过 `/static/...` 访问。
- 配置中的背景图必须写成 CSS 图片值，例如 `url('/static/background.webp')`。
- Logo、模块图片、音乐封面使用普通路径，例如 `/static/logo.webp`。
- 外链只使用 HTTPS；需要新窗口打开时设置 `external: true`。
- 资源文件名保持大小写一致，避免 Linux 和 Cloudflare Pages 环境中出现 404。

## 验证方法

修改配置或主题后执行：

```bash
bun x tsc --noEmit
bun run build
```

需要本地预览时执行：

```bash
bun run quartz build --serve
```

建议检查以下页面：

- `/`：站点名称、Logo、资料卡、快捷入口、首页横幅、模块图片和音乐播放器。
- `/posts/`：文章时间线和导航激活态。
- `/categories/`：归档入口名称、说明和数量。
- `/tags/`：标签云。
- `/about/`：站点说明。

若启用了背景图、Logo 图片或音乐文件，还应在浏览器开发者工具中确认资源没有 404。
