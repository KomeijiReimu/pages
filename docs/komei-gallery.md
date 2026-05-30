# 相册照片使用说明

首页相册会在构建时自动收集 `content/photos/` 中的图片，并展示为“精选拼贴 + 明信片 + 瀑布流”。

## 添加照片

推荐按年份整理：

```txt
content/photos/2026/IMG_20260530_153000.jpg
```

支持 `jpg`、`jpeg`、`png`、`webp`、`avif`。添加后运行：

```bash
bun run build
```

## 自定义标题和精选图

可选编辑 `content/photos/_gallery.yml`：

```yaml
photos:
  2026/IMG_20260530_153000.jpg:
    title: 午后的云
    alt: 午后天空中层叠的云
    date: 2026-05-30
    location: 日常散步
    featured: true
    order: 1
```

- `title`：照片标题。
- `alt`：图片替代文本。
- `date`：拍摄日期。
- `location`：地点或分组。
- `featured`：设为 `true` 后优先进入首页精选拼贴。
- `order`：排序数字，越小越靠前。

不写 `_gallery.yml` 也能显示，系统会根据文件名自动生成标题和日期。

## 调整相册样式与数量

整体标题、说明、照片来源目录、展示数量和明信片文字在 `quartz/komeireimu.config.ts` 的 `homepage.gallery` 中配置。

不要把相册照片放进 `public/`，构建产物目录可能被重新生成；也不要把照片放进 `content/notes/`，那里是笔记附件目录。
