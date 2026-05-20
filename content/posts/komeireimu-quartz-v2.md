---
title: KomeiReimu Quartz V2 主题说明
description: 记录 KomeiReimu V2 如何把 Quartz 默认壳改造成 Cynosura/Fuwari 风格博客。
date: 2026-04-28
tags:
  - blog/theme
  - quartz
  - komeireimu
comments: false
---

KomeiReimu Quartz V2 的目标是保留 Quartz 的文章、标签、反链和图谱能力，同时让首页与导航不再像默认数字花园壳。

这版结构把可变信息集中到 `quartz/komeireimu.config.ts`：

- 顶部导航链接指向真实路由。
- 首页 hero、profile、social links 和模块卡片都来自配置。
- 文章卡片收录 `content/posts/` 下的随笔文章和 `content/notes/` 下的结构化笔记，避免把首页、分类页、标签页和关于页误当作博客文章。
- Giscus 仍保持占位配置，未填真实 ID 前不会渲染评论区。

后续写作时，可以在 `content/posts/` 新建随笔，或在 `content/notes/` 新建结构化笔记；填写日期、摘要和标签后，Quartz 会继续生成标签页、目录页和文章页。
