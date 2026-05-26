---
title: KomeiReimu 博客主题指南
---

# KomeiReimu 博客主题指南

本文档记录 `/home/Brant/mysite/pages` 中 KomeiReimu Quartz 主题的当前结构。主题目标是：主页吸收 Cynosura 的浅蓝背景、居中站点头部、横向导航、资料卡、横幅、时间轨迹和模块化首页；文章、归档、标签和关于页采用更接近 Fuwari 的清晰路由；单篇文章保留 Quartz 的正文渲染、目录和反链能力。

## 当前约束

- 站点名：`KomeiReimu`。
- 不写入假域名；没有真实域名前不配置 `baseUrl`。
- 不启用第三方站点统计，`quartz.config.ts` 中的 `analytics` 保持 `null`；如需前台浏览量，优先使用 Cloudflare Pages Functions + D1。
- Giscus 只保留占位值；未填入真实仓库与分类 ID 前，评论区会被条件隐藏。
- 不随意移动或删除用户笔记。原首页里的 WSL 笔记已保存在 `content/notes/wsl-command-note-preserved.md`。
- 当前以 Bun 作为本地与 Cloudflare Pages 构建入口，`bun.lock` 用于锁定依赖；提交时仍应排除 `.sisyphus/`、构建输出、依赖目录和本地环境变量。

## 主要文件

| 路径                                     | 作用                                              | 修改建议                                              |
| ---------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `quartz/komeireimu.config.ts`            | KomeiReimu 站点文案、导航、资料卡、背景、模块配置 | 优先在这里改首页文案、背景、模块、归档入口和 Giscus   |
| `quartz.layout.ts`                       | Quartz 页面组合与条件渲染                         | 只在调整首页/列表页/文章页组件位置时修改              |
| `quartz/styles/custom.scss`              | KomeiReimu 视觉系统与组件样式                     | 使用 `--komei-*` 与 Quartz theme token，不写散乱样式  |
| `quartz/components/TopNav.tsx`           | 居中站点头部与横向导航条                          | 导航项通常改配置，不直接改组件                        |
| `quartz/components/HomeHero.tsx`         | 首页资料卡与大视觉横幅                            | 由 `homepage.hero` 和 `profile` 驱动                  |
| `quartz/components/PostCards.tsx`        | 首页时间轨迹与 `/posts/` 文章时间线               | 由文章 frontmatter 与 blog 过滤规则驱动               |
| `quartz/components/CategoryOverview.tsx` | `/categories/` 归档入口卡                         | 使用 `categoryLabels` 显示名称、描述和数量            |
| `quartz/components/TagCloud.tsx`         | `/tags/` 标签索引                                 | 使用 Quartz frontmatter tags                          |
| `quartz/components/HomeModules.tsx`      | 技能、设备、项目、音乐、相册等首页模块            | 由 `homepage.modules` 配置驱动                        |
| `content/index.md`                       | 首页真实路由 `/`                                  | 保持为首页，不存放无关笔记                            |
| `content/posts/index.md`                 | 文章路由 `/posts/`                                | 保留 `komei-posts-index` 类，避免 Quartz 默认列表重复 |
| `content/categories/index.md`            | 归档路由 `/categories/`                           | 保留 `komei-categories-index` 类                      |
| `content/tags/index.md`                  | 标签路由 `/tags/`                                 | 保留 `komei-tags-index` 类                            |
| `content/about/index.md`                 | 关于路由 `/about/`                                | 面向读者说明站点定位                                  |

## 视觉系统

主题颜色来自 `quartz.config.ts` 的 Quartz theme：

- 浅色模式使用淡蓝背景、深蓝灰文字、蓝色主强调和浅青辅助色。
- 深色模式使用深蓝黑背景、浅色文字、亮蓝强调和柔和青绿色。
- 字体保持中文友好：标题使用 `LXGW WenKai Screen` 的常规字重，正文使用 `Noto Sans SC`，代码使用 `IBM Plex Mono`。标题字体不再请求不稳定的多字重子集，避免 Google Fonts 返回 400。

`custom.scss` 在此基础上定义最小设计系统：

- 间距：`--komei-space-1` 到 `--komei-space-8`。
- 圆角：`--komei-radius-sm`、`--komei-radius-md`、`--komei-radius-lg`、`--komei-radius-xl`。
- 卡片：`--komei-panel`、`--komei-card`、`--komei-card-strong`、`--komei-glass`。
- 描边与阴影：`--komei-border-soft`、`--komei-border-strong`、`--komei-soft-shadow`、`--komei-shadow`。

以后新增视觉样式时，应先扩展这些 token，再在组件中使用，避免硬编码零散颜色、边距和圆角。

## 首页结构

首页现在按 Cynosura 参考图组织：

1. 居中的站点 logo、标题和副标题。
2. 宽横向导航条，链接到真实的 `/`、`/posts/`、`/categories/`、`/tags/` 和 `/about/`，其中 `/categories/` 对外显示为“归档”。
3. 第一行内容：左侧资料卡，右侧大视觉横幅；横幅含唯一的 `h1#komei-home-title`、更明确的站点说明、三条阅读路径提示、按钮和结构统计标签。
4. 最近文章区：由 `PostCards` 从 `content/posts/` 和 `content/notes/` 中读取真实文章，使用横向时间线展示日期、标题、自动摘要和标签；标题本身就是入口，不再额外显示“打开文章”文字按钮。
5. 归档入口区：由 `CategoryOverview` 汇总长期笔记入口，并显示中文名、访客友好的说明、数量和查看归档提示。
6. 标签索引区：由 `TagCloud` 汇总 Quartz frontmatter tags，并保留每个标签的数量。
7. 首页收藏模块：技能、设备、项目、音乐、相册等内容由配置驱动，模块视觉密度低于文章区，让首页阅读路径更安静。

首页顶部导航在 `/` 的首屏保持正常文档流，视觉上嵌入页面顶部；当页面滚过导航原始位置后，脚本会通过 sentinel/slot 切换浮动状态，让同一个导航栏丝滑吸附到视口顶部，滚回顶部后恢复嵌入状态。移动端导航保持横向紧凑滚动。区块标题使用统一的胶囊 eyebrow、层级化标题、说明文字、可选摘要胶囊和渐变分隔线，避免退回普通 Markdown/Word 标题观感。最近文章横向时间线只展示一组轻量卡片，摘要优先读取 frontmatter，缺失时读取 Quartz 自动生成的描述。卡片左侧蓝色或强调色竖线只作为独立装饰轨存在，样式上与正文留出明确安全间距，不应穿过标题、说明或数量信息；归档数量使用低调元信息块，并和“查看归档”提示共同组成卡片底部探索 affordance。

## 文章、归档与性能保护

- `/posts/` 使用 `PostIndex` 组件，先显示“随笔”，再显示 Fuwari archive 风格的“全部文章”竖向时间线。完整时间线按年份分组，左侧是日期，中间是虚线和节点，右侧是标题与桌面端标签；滚动到哨兵附近会自动追加，不把“加载更多”按钮作为主交互。
- `/categories/` 对外显示为“归档”，使用 `CategoryOverview` 展示主题入口。卡片不再暴露内容目录路径，只显示访客能理解的入口说明、数量和查看提示。
- 文件夹页的 `FolderContent` 会把子目录和笔记拆成两个区域：顶部摘要分开显示“子目录”和“笔记”数量；子目录使用低噪声索引行，保留弱化的 SVG 文件夹提示，笔记继续使用轻量列表，避免目录和具体笔记在视觉上完全同级。
- 文章元信息由 `ContentMeta` 显示日期、字数和阅读时间，例如“2,400 字，8 分钟阅读”。字数来自 `reading-time` 对正文文本的统计。
- 图片、音频、视频和 iframe 资源通过 `CrawlLinks` 统一走懒加载或低预载策略。图片会补 `loading="lazy"` 和 `decoding="async"`，并由基础样式提供稳定占位，降低外链图片失败或延迟解码时的滚动布局抖动；音视频默认 `preload="metadata"`。
- Markdown 中相对资源路径会在构建阶段做本地大小写校正。这样 `i/dij1.jpg` 可以匹配实际存在的 `i/Dij1.jpg`，避免 Linux 和 Cloudflare Pages 环境下因大小写不一致出现 404。
- 悬停预览已经改为轻量摘要预览：先延迟触发，离开时取消请求；目标页面过大时直接跳过；普通页面也只提取标题、描述和少量正文，不再把整篇 `.popover-hint` 插入浮层。
- SPA 路由会检查目标 HTML 大小，超过预算时降级为浏览器原生跳转，避免 `DOMParser` 和 `micromorph(document.body, html.body)` 在超长笔记上造成主线程长时间阻塞。普通站内跳转只在页面替换和导航事件完成后统一处理一次滚动位置，避免进入具体笔记后出现额外下移。
- 搜索输入增加防抖和过期请求保护；搜索预览对大页面不再强行抓取、解析和高亮完整正文，也不会向页面输出性能降级说明文案。
- 单篇文章右侧栏优先展示目录和反链，默认不再加载本地图谱脚本，避免 Pixi/D3 图谱资源和动画调度进入超长笔记阅读路径。
- 目录高亮只扫描 `.toc a[data-for]`，不会把 Explorer 链接纳入高亮映射；只有可见状态变化时才写入 `in-view` 类。超长页面会限制实时观察的标题数量，避免目录高亮本身成为滚动负担；目录容器底部保留更大的安全留白，避免被悬浮工具栏遮挡。
- 普通代码块不会永久关闭语法高亮或行号，而是在构建阶段统计每个 `pre` 的行数并写入 `data-code-lines` 与 `--komei-code-intrinsic-size`。初始 HTML 只保留轻量源码占位，把完整高亮 HTML 存在惰性数据中；运行时通过 `IntersectionObserver` 和空闲任务队列在视口附近渐进挂载高亮 DOM。滚动中不执行水合、回收、批量布局读取或 HTML 解析；超长页面会缩小预取范围、延长滚动冷却、一次只处理一个小任务，并用观察器事件代替全量距离扫描。Mermaid 代码块不走这套回收，避免影响它的全屏弹层。
- 复制代码按钮只在点击时读取代码文本，避免进入超长笔记时一次性对所有代码块执行 `innerText` 布局计算。若代码块已有 `data-clipboard`，仍优先使用构建阶段保存的原始源码。
- 超长笔记页会关闭站点头部的毛玻璃滤镜，减少长页面滚动和 F12 视口变化时的合成与重绘压力。
- Explorer 只滚动自身侧栏容器来展示当前条目，不再调用会连带推动主页面的平滑 `scrollIntoView`；移动端 Explorer 在视口缩窄时会自动折叠并释放 `mobile-no-scroll`，避免桌面侧栏因 F12 停靠或窗口缩窄而把页面误锁成不可滚动状态。

首页、文章列表、归档、标签和关于页通过 `body[data-slug="..."]` 的样式去掉 Quartz 默认左右侧栏占位，避免再出现 Explorer 或三栏 Quartz 外观。单篇文章不受这组规则影响，仍然可以显示目录和反链。

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
  { label: "首页", href: "/", description: "回到首页" },
  { label: "文章", href: "/posts/", description: "按时间线浏览文章" },
  { label: "归档", href: "/categories/", description: "按主题浏览归档" },
  { label: "标签", href: "/tags/", description: "浏览主题标签" },
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
  badge: "Now writing",
  status: "整理笔记、博客与小型作品中",
  location: "Blog lighthouse",
  bio: "...",
  motto: "低噪声地记录，高密度地生活。",
  facts: [
    { label: "当前状态", value: "写作 / 阅读 / 归档" },
    { label: "创作坐标", value: "云端博客 · 长期笔记" },
  ],
  socials: [
    { label: "文章", href: "/posts/", tone: "soft", icon: "✦", description: "阅读最新文章" },
    { label: "标签", href: "/tags/", tone: "leaf", icon: "#", description: "浏览标签索引" },
    { label: "关于", href: "/about/", tone: "rose", icon: "♡", description: "查看作者与站点说明" },
  ],
}
```

- `avatarInitials` 控制资料卡头像文字。
- `facts` 控制资料卡里的小信息块。
- `socials` 既支持站内根相对路径，也支持外链；站内路径会自动带上 Quartz 的相对根路径。
- `tone` 映射到 `.komei-profile-link--leaf`、`.komei-profile-link--rose` 等样式。

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
    eyebrow: "KomeiReimu Blog",
    title: "嗨，这里是 KomeiReimu",
    lead: "...",
    purpose: ["从最新文章开始阅读", "用标签追踪主题", "按目录回到长期知识"],
    primaryAction: { label: "阅读最新文章", href: "/posts/" },
    secondaryAction: { label: "浏览标签", href: "/tags/" },
    bannerAlt: "...",
    stats: [
      { label: "入口", value: "文章 / 标签 / 归档" },
      { label: "气质", value: "浅蓝、低噪声" },
      { label: "阅读", value: "Quartz 深读" },
    ],
  },
}
```

- `title` 不再使用超大溢出排版，样式已限制在横幅内，并且首页只保留一个 `h1#komei-home-title`。
- `purpose` 是首页阅读路径提示，应该写成短句，避免重复 CTA 文案。
- `bannerAlt` 作为横幅视觉描述的配置预留；当前横幅装饰层为 `aria-hidden`，主要可访问内容来自可见标题、说明和按钮。
- `stats` 展示首页结构、视觉气质和阅读路径。

### 首页模块

```ts
homepage: {
  modules: [
    {
      key: "skills",
      eyebrow: "技能",
      title: "工程笔记、前端与写作",
      description: "...",
      items: ["Quartz", "TypeScript", "Markdown"],
    },
  ],
}
```

已内置模块：

- `skills`：技能。
- `devices`：设备与工具。
- `projects`：项目。
- `music`：音乐。
- `gallery`：相册/画廊。

`key` 会变成 CSS 类名的一部分，例如 `.komei-module-card--gallery`。新增模块时请使用稳定、英文、小写的 key。

音乐模块不是静态假播放器，而是由 `homepage.music` 配置驱动的真实 `<audio>` 播放器。首页 UI 采用更接近私人唱片展示柜的独立音乐区：左侧是当前封面、播放按钮、进度和时间，右侧播放列表是带小封面的低对比软卡片，当前曲目使用暖色高亮。为了降低首页视觉密度，歌词/备注和标签仍保留 `data-komei-music-lyrics`、`data-komei-music-tags` 等 DOM hook 供脚本更新，但不作为常驻视觉内容堆叠在界面中。

```ts
music: {
  label: "最近在听",
  coverFallback: "/static/og-image.png",
  tracks: [
    {
      sourceKind: "network",
      src: "https://...",
      link: "/posts/",
      title: "夜航片段",
      artist: "收藏歌单",
      album: "最近循环",
      duration: "03:24",
      mood: "夜间写作",
      tags: ["写作", "夜间", "循环"],
      lyrics: "给这首歌留一句私人备注。",
      cover: "/static/og-image.png",
    },
    // 可以继续追加曲目；首页列表会在内容变多后保持固定高度并滚动。
  ],
}
```

规则：

1. `sourceKind` 必须明确写成 `"network"`、`"local"` 或 `"none"`。
2. `network` 曲目只应使用确认可公开访问且允许引用的 HTTPS 直链音频；`local` 曲目应指向站点同源资源。歌单可以持续追加，首页播放列表会固定高度并滚动展示。
3. `link` 是可选曲目链接，和音频 `src` 彼此独立；它只接受站内根相对路径（例如 `"/posts/"`）或 HTTPS 外部 URL。当前左侧大封面会在曲目有安全 `link` 时作为普通链接打开该地址，切换歌单时自动同步；未配置 `link` 或写入不安全协议时，封面会移除 `href` 并以 `aria-disabled="true"` 安全降级，不发生跳转。
4. `sourceKind: "none"` 或缺失/无效 `src` 的曲目会作为仅展示曲目保留，可以切换查看封面和基础信息，但播放按钮会禁用，不会伪装成有效音源；这类曲目仍可按需单独配置 `link`。
5. 主播放控件是圆形图标按钮，按钮不会用可见的“播放/暂停/仅展示”文字作为主界面；可访问名称通过 `aria-label` 和隐藏文本同步，脚本只更新图标状态、隐藏标签和状态文案。
6. 播放列表行始终保留 `data-source-kind`、`data-src`、`data-title`、`data-artist`、`data-album`、`data-mood`、`data-duration`、`data-lyrics`、`data-cover`、`data-link`、`data-link-internal` 和 `data-tags`，用于切歌、展示、封面链接更新和运行时校验。未配置 `cover` 时使用 `coverFallback`，主封面和列表缩略图都以完整图像方式显示，不裁切关键内容。
7. 播放器不会自动播放；进度与时间来自真实 `<audio>` 的 `timeupdate`、`loadedmetadata`、`play`、`pause` 和 `ended` 事件，拖动进度条会回写到当前音频的 `currentTime`。

#### 大歌单与滚动

播放列表数量完全来自 `homepage.music.tracks`，组件不会写死 3 首或截断歌单；新增曲目时继续在 `quartz/komeireimu.config.ts` 里追加 `KomeiMusicTrack` 对象即可。当前播放区保持固定可见，滚动只发生在 `.komei-music-player__playlist`，通过 `max-height`、`overflow-y: auto` 和细滚动条承载更多曲目，避免大歌单把整个首页模块撑高。

新增曲目时必须保留 `sourceKind`：`network` 使用 HTTPS 音频直链，`local` 使用站点同源资源，`none` 用于只展示但不可播放的条目。封面使用每首歌的 `cover`，缺省时回退到 `coverFallback`；主封面和列表缩略图都使用完整图像显示方式，避免专辑图被裁切。若希望用户点击当前大封面进入专辑页、文章页或外部曲目页，为该曲目补 `link` 即可；不要把右侧播放列表行改成链接，列表行需要继续作为按钮承担选曲行为。

首页和列表区块标题也在配置中集中管理：`homepage.profileFacts` 控制资料卡事实标签，`homepage.sections.posts/modules/categories/tags` 控制首页最近文章、模块区、归档区、标签区以及 `/posts/`、`/categories/`、`/tags/` 的可见标题、说明、行动文案与空状态文案。调整这些文案时优先改配置，不要直接改组件。

### 文章、归档和标签

```ts
blog: {
  postSlugPrefixes: ["posts", "notes"],
  excludedSlugs: ["index", "posts/index", "categories/index", "tags/index", "about/index"],
  excludedSlugPrefixes: ["tags", "categories"],
  recentPostLimit: 5,
  tagCloudLimit: 24,
}
```

- `content/posts/` 和 `content/notes/` 都会被视为文章来源：`posts` 主要显示在“随笔”区，`notes` 与 `posts` 一起进入“全部文章”时间线。
- `content/posts/index.md`、`content/categories/index.md`、`content/tags/index.md` 和 `content/about/index.md` 是路由页，不会被当成文章卡片。
- 归档入口来自长期笔记的一级主题，卡片会明确显示中文名、说明和数量，避免数量被裁切或隐藏。
- 标签来自 Quartz frontmatter `tags`，首页和 `/tags/` 会保留标签名称与数量，不写死标签数据。
- 反链组件会过滤首页 `index` 作为来源，避免首页推荐或说明链接污染单篇文章的反链列表；正文文章之间的反链仍正常显示。

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
| Build command    | `bun run build`                                  |
| Output directory | `public`                                         |
| Root directory   | 包含 `quartz.config.ts` 的目录                   |
| Node.js version  | Node 22 或其他满足 `package.json` engines 的版本 |

## 验证命令

从 `/home/Brant/mysite/pages` 执行：

```bash
bun run check
bun test
bun run build
```

本地预览默认只绑定本机地址：

```bash
bun run quartz build --serve
```

如果需要在局域网或虚拟机外访问预览服务，可以显式开放监听地址：

```bash
bun run quartz build --serve --host 0.0.0.0 --port 8080 --wsPort 3001
```

`--host` 会同时作用于页面服务和热更新 WebSocket。浏览器端热更新默认使用当前页面的主机名连接，因此通过局域网 IP 打开页面时不需要再把 WebSocket 写死到 `localhost`；如需反向代理或远程开发，可以继续用 `--remoteDevHost` 覆盖浏览器端连接主机。

构建后重点检查：

- `/`：应有 `komei-site-header`、`komei-top-nav`、`komei-profile-card`、`komei-home-hero__banner`、`komei-post-cards--timeline`、`komei-category-overview`、`komei-tag-cloud`、`komei-home-modules`，且没有 Explorer。
- `/`：应只有一个 `h1#komei-home-title`，主按钮指向 `/posts/`，次按钮指向 `/tags/`，最近文章时间线使用真实 `content/posts/` 与 `content/notes/` 内容且没有静态进度条。
- `/`：归档卡应保留标题、各自不同的说明、数量和查看归档提示；不应出现“归档入口 / 沿着这个主题继续阅读”这类重复套话。标签胶囊应保留标签名称与数量；音乐播放器应保留所有 `data-komei-music-*` hook，`sourceKind: "none"` 曲目只能展示不能播放。
- `/posts/`：应先显示“随笔”，再显示“全部文章”竖向年份时间线；继续滚动应自动加载更多条目，按钮不应作为默认主入口露出。
- `/categories/`：页面可见标题应为“归档”，卡片应显示归档名、说明和数量，不应出现 `content/notes`、`目录路由` 等过程性文案。
- `/notes/运维/Linux/` 等文件夹页：应分成“子目录”和“笔记”两个区域，顶部摘要应准确显示“X 个子目录 · Y 篇笔记”；子目录以贴近正文的轻量索引行显示，SVG 图标只能作为弱提示，笔记以轻量列表显示。
- `/tags/`：应显示标签索引。
- `/about/`：应存在并使用面向访客的说明。
- `/posts/komeireimu-quartz-v2/`：单篇文章可以继续显示目录和反链，右侧目录应优先出现在图谱类重组件之前。
- 新开页面或站内跳转时，右下角浮动控制组应从首帧开始固定在右下角，不应因页面入场动画短暂出现在页面中部。
- 超长代码笔记，例如 `/notes/Code/GO/README` 与 `/notes/Code/C++/C--算法与数据结构总结笔记`：`pre` 应带有 `data-code-lines`、`data-komei-code-lazy` 和 `--komei-code-intrinsic-size`，初始 DOM 中不应一次性出现全部 Shiki 高亮 `span`；滚到代码块附近并停止滚动后，才按空闲预算逐步挂载完整高亮与行号。
- 超长代码笔记：复制按钮应仍然可用，但源码读取应发生在点击时；验证时可复制任意一个代码块，确认内容没有混入行号且换行正常。
- 超长代码笔记：滚动和 F12/resize 期间不应出现整页交互锁死；滚动中不应发生高亮 DOM 替换和批量布局读取；调整视口后移动端 Explorer 不应给 `html` 长时间保留 `mobile-no-scroll`。
- 从 `/posts/`、`/categories/` 或文件夹页进入具体笔记时，普通无 hash 导航的 `scrollY` 应稳定回到 0；直接打开超长笔记等待 1-2 秒后也不应被 Explorer 当前项自动推下去。

## 排障

### 首页仍像 Quartz

检查：

1. `content/index.md` 是否存在。
2. `quartz.layout.ts` 是否在 `slug === "index"` 时按 `HomeHero`、`PostCards`、`CategoryOverview`、`TagCloud`、`HomeModules` 的顺序渲染。
3. `custom.scss` 是否被构建进 `index.css`。
4. `body[data-slug="index"]` 是否应用了隐藏左右侧栏的样式。

### 按钮文字看不见

检查 `.komei-button--primary` 和 `.komei-button--ghost` 是否仍使用高对比度 token。主按钮文字应为 `var(--light)`，幽灵按钮文字应为 `var(--dark)`。

### 归档数量或描述被裁切

检查 `.komei-category-card` 是否保持足够 `min-height`、左侧装饰轨间距和 `.komei-category-card__count` 的元信息块样式。不要把归档卡恢复成固定低高度，不要让装饰轨进入文本区域，也不要把数量恢复成椭圆胶囊。

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
