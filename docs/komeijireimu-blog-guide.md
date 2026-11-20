---
title: KomeijiReimu 博客使用指南
---

首页、导航和专题卡片的设置在 `quartz/komeijireimu.config.ts`。首次使用时，安装 Node.js 22 或更高版本及 Bun，在仓库根目录执行 `bun install --frozen-lockfile`。运行 `bun run preview` 后，打开 `http://localhost:8080/` 查看效果。

| 要修改的内容                       | 配置位置                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| 导航上的站名、Logo、栏目链接       | `site.navLabel`、`site.logo`、`navLinks`                  |
| 头像、署名、标语、个人链接         | `profile`                                                 |
| 首页大标题、两个阅读按钮、横幅背景 | `homepage.hero`                                           |
| 首页各栏标题、个人空间卡片、播放器 | `homepage.sections`、`homepage.modules`、`homepage.music` |
| 相册照片和明信片                   | `content/photos/`、`homepage.gallery`                     |
| 全站浅色和深色背景                 | `background`、`darkBackground`                            |
| 文章流收录范围、专题卡片名称与说明 | `blog`、`categoryLabels`                                  |

## 站名、Logo 与导航

导航左上角的「KomeijiReimu的博客」取自 `site.navLabel`。首页浏览器标签上的名称取自 `quartz.config.ts` 的 `configuration.pageTitle`；文章页显示文章标题，后面接 `configuration.pageTitleSuffix`。个人署名另设在 `profile.name`。

`site.logo` 当前使用两张「觉之瞳·心线」图，`src` 用于浅色，`darkSrc` 用于深色。将图片放在 `quartz/static/`，配置里写它的公共路径：

```ts
logo: {
  kind: "image",
  src: "/static/heartline-light.svg",
  darkSrc: "/static/heartline-dark.svg",
  alt: "觉之瞳·心线",
} as KomeiLogo,
```

改用文字标识时，把对象内容换成 `kind: "text", text: "KR"`；使用内置图案则填 `kind: "mark"`。要换浏览器标签页图标，替换 `quartz/static/favicon-32.png`；若同时更新根路径的 `/favicon.ico`，也要替换它的构建源图 `quartz/static/title1.png`。

`navLinks` 的数组顺序就是导航顺序：**首页 → 专题 → 文章 → 标签 → 关于**。每项的 `label` 是可见文字，`href` 指向站内页面，`description` 是悬停提示。例如专题入口为：

```ts
{ label: "专题", href: "/categories/", description: "按主题阅读笔记" }
```

## 首页标题与个人资料

`homepage.hero.eyebrow` 是大标题上方的小字。`titleLines` 的每个元素单独占一行；设为 `[]` 则显示 `title`。当前标题这样分行：

```ts
title: "相信的心就是你的魔法",
titleLines: ["相信的心", "就是你的魔法"],
```

`primaryAction` 和 `secondaryAction` 分别设置「阅读最新文章」和「浏览标签」两个按钮。`label` 是按钮文字，`href` 是站内目标路径。

资料卡显示 `profile.name`、`handle` 和 `motto`。`avatar.src` 是头像路径，`avatar.alt` 是替代文字；没有头像时，首页显示 `avatarInitials`。要加一行个人信息，在 `facts` 中添加 `{ label: "所在地", value: "上海" }`。

在 `profile.links` 中添加个人链接。例如：

```ts
{
  label: "GitHub",
  href: "https://github.com/KomeijiReimu",
  description: "访问 GitHub 主页",
  icon: "github",
  tone: "gray",
  variant: "icon",
  external: true,
}
```

`description` 是链接的无障碍名称。`icon` 支持 `github`、`mail`、`archive`、`book`、`rss`、`tag` 和 `home`，也可以直接填一个字符。`variant` 选 `icon`（默认）或 `pill`（带文字的圆角入口）。外链设 `external: true` 后在新标签页打开。`href` 留空时，首页显示不可点击的入口；要隐藏它，设 `enabled: false`。`facts` 也支持 `enabled`。

## 全站背景与首页横幅

两种背景的图片写法不同。**全站背景**的 `image` 填 CSS 图片值，例如 `"url('/static/background (3).jpg')"`；**首页横幅**的 `homepage.hero.background.src` 直接填路径，例如 `"/static/back (2).jpg"`。

| 用途       | 全站 `background` / `darkBackground` | 首页 `homepage.hero.background` | 示例值                                   |
| ---------- | ------------------------------------ | ------------------------------- | ---------------------------------------- |
| 可见程度   | `imageOpacity`                       | `opacity`                       | `"0.2"`                                  |
| 对齐位置   | `imagePosition`                      | 由首页样式设置                  | `"center top"`（全站）                   |
| 缩放       | `imageSize`                          | `size`                          | `"cover"`、`"contain"`、`"320px auto"`   |
| 平铺       | `imageRepeat`                        | `repeat`                        | `"no-repeat"`、`"repeat"`                |
| 与底色混合 | `imageBlendMode`                     | `blendMode`                     | `"normal"`、`"soft-light"`、`"multiply"` |

`background` 用于浅色，`darkBackground` 用于深色，两套可以分别选图。全站背景设 `image: "none"` 可关闭图片；首页横幅留空 `src` 即可。全站的 `base` 和 `wash` 设置渐变底色，`primaryOrb`、`secondaryOrb` 设置两处柔光颜色，`grid` 设置网格色，`grainOpacity` 调整纹理的可见程度。

要调整人物在首页横幅里的位置，改 `quartz/styles/_library.scss` 中 `.komei-home-hero__backdrop` 的 `background-position`：桌面为 `62% 45%`，窄屏为 `65% 45%`。

## 个人空间与音乐播放器

「个人空间」的标题和说明在 `homepage.sections.modules`。`homepage.modules` 决定卡片顺序。添加普通卡片时填写 `key`、`eyebrow`（小标题）、`title`、`description` 和 `items`（条目数组）。可选的 `image` 指定装饰图的 `src`、`alt` 和 `position`。

播放器占用 `homepage.modules` 中 `key: "music"` 的卡片。保留这张卡，将 `homepage.music.enabled` 设为 `true`，再向 `tracks` 添加曲目。`label` 是播放列表标题，`coverFallback` 是曲目没有封面时使用的图片。

```ts
{
  sourceKind: "local",
  src: "/static/music/张明敏 - 我的中国心.mp3",
  title: "我的中国心",
  artist: "张明敏",
  duration: "03:08",
  mood: "",
  tags: ["写作"],
  cover: "/static/music/张明敏 - 我的中国心.jpg",
  active: true,
}
```

- `sourceKind: "local"` 使用站内文件；`"network"` 使用 HTTPS 音频地址；`"none"` 只展示曲目信息。
- `album`、`lyrics` 和 `cover` 可分别设置专辑、歌词或说明、封面。`src` 是播放的音源，`link` 是点击封面打开的站内页面或 HTTPS 链接。
- 首次显示第一首标有 `active: true` 的曲目；没有标记时显示列表第一首。要隐藏播放器，设 `enabled: false` 或清空 `tracks`。

## 首页相册

把照片放进 `content/photos/`，可以按年份建子目录。构建会递归收集 JPG、JPEG、PNG、WebP 和 AVIF。照片及子目录名建议用连字符代替空格，例如 `2026/spring-walk.jpg`。

`homepage.gallery` 的 `enabled` 控制相册开关，`sourceDir` 指向照片目录，`eyebrow` 和 `title` 设置栏目标识与标题。`postcard` 中的 `title`、`lines`、`location`、`timestamp` 分别对应明信片标题、正文各行、落款地点和时间。

要给单张照片加说明或指定排序，在 `content/photos/_gallery.yml` 中以相对照片目录的路径为键。这份文件也会随照片公开，填写准备公开的信息即可。

```yaml
photos:
  2026/spring-walk.jpg:
    title: 四月的光
    alt: 午后街角的树影
    date: 2026-04-26
    featured: true
    order: 1
```

`alt` 是替代文字，省略时使用 `title`，两者都省略则从文件名取标题。相册先按 `order` 从小到大排序，未填的排在后面；同一顺序按日期从新到旧排列。`maxItems` 限定展示总数（当前为 48）。在这些照片中，标有 `featured: true` 的优先进入明信片旁的精选区。总共只有 1–5 张时全部精选；更多时按 `featuredCount` 分配（当前为 4），其余进入下方瀑布流。

## 文章与专题

`blog.postSlugPrefixes` 决定文章流从哪些目录收录文章，当前为 `posts` 和 `notes`。`blog.excludedSlugs` 与 `excludedSlugPrefixes` 分别排除指定页面和整组路径；目录索引也不列为文章。`recentPostLimit` 控制最近文章数量，`tagCloudLimit` 控制标签云数量。

专题页 `/categories/` 按 `notes/` 下的一级目录列出笔记。`categoryLabels` 可设置各组的 `label`、`description` 和 `accent`。一级目录若是笔记家族，卡片使用目录标题并标出「笔记家族」。要指定主笔记并列出从属篇目，见[主题目录与主笔记](./features/document-families.md)。

桌面上悬停普通文章链接时，预览卡会显示文章标题和摘要。要让长文链接只显示链接文字和路径，可加 `data-no-popover="true"`，这样悬停时不请求正文：

```html
<a class="internal" href="/notes/large-page/" data-no-popover="true">大型笔记</a>
```

## 本地预览与构建

在仓库根目录运行：

| 命令              | 用途                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bun run preview` | 在 `http://localhost:8080/` 预览，包括本机已有、被 Git 忽略的笔记和随笔。产物位于 `.quartz-cache/preview/`，仅供本地查看。 |
| `bun run check`   | 检查 TypeScript 类型和文件格式。                                                                                           |
| `bun run build`   | 按当前发布过滤规则生成静态站点到 `public/`。                                                                               |

个人笔记和随笔由私人笔记库的手动发布流程同步、构建并部署到 Cloudflare Pages。站点代码的提交和推送不包含这些正文。
