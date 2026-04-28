---
title: 关于
description: 关于 KomeiReimu 博客与当前部署选择。
comments: false
---

KomeiReimu 是一个基于 Quartz v4 的个人博客与笔记入口。

当前约束：

- 不配置真实域名，也不写入假域名。
- 不启用 analytics、统计或追踪脚本。
- Giscus 只保留占位参数，未填真实仓库与分类 ID 前不会显示评论区。
- 原有笔记不强制移动；本次仅为了首页路由，把原 `content/index.md` 的 WSL 笔记完整保存到 `content/notes/wsl-command-note-preserved.md`。

如果之后要调整头像、社交链接、首页模块、背景或导航，请优先修改 `quartz/komeireimu.config.ts`，再运行 `bun run check` 和 `bun run quartz build` 验证。
