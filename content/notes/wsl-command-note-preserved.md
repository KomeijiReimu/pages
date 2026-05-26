---
title: WSL 命令笔记
description: WSL 常用命令、发行版维护与终端工具配置记录。
date: 2026-04-28
tags:
  - notes/wsl
  - operations
comments: false
---

# 命令

使用`wsl --help`查看，包括~~设置默认用户~~、迁移发行版、设置默认发行版等操作

---

# 设置默认用户

设置wsl子系统的默认用户

1. ~~`wsl --manage Ubuntu --set-default-user xxx`~~
2. 上面那个没用，需要在子系统中修改`/etc/wsl.conf`

```xml
[user]
default = xxx
```

---

# 迁移发行版

可以导出后再导入，或者直接利用命令：

```powershell
wsl --manage <发行版名称> --move <目标路径>
```

---

# 快照/备份

```powershell
wsl --shutdown
wsl --export <发行版名称> <目标路径>
# 还原系统
wsl --import <发行版名称> <安装位置> <快照路径>
```

_同样也可用于导入导出_

---

# 查找发行版在Windows磁盘中的位置

注册表

```json
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Lxss\
```

中的子项记录了所有发行版的信息

也可以通过

```powershell
Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss | ForEach-Object { Get-ItemProperty $_.PSPath } | Select-Object DistributionName, BasePath
```

查询

---

# wsl内安装codex的流程

## 安装zsh

_这是为了使用更方便且更美观的终端_

https://www.haoyep.com/posts/zsh-config-oh-my-zsh/

**安装zsh**

```bash
sudo apt install zsh git curl -y
chsh -s /bin/zsh
```

**安装oh-my-zsh**

```bash
sh -c "$(curl -fsSL https://install.ohmyz.sh/)"
```

**使用*powerlevel10k*主题**

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
```

在 `~/.zshrc` 设置 `ZSH_THEME="powerlevel10k/powerlevel10k"`。接下来，终端会自动引导你配置 `powerlevel10k`。

**安装插件**

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
```

设置插件为`plugins=(git zsh-autosuggestions zsh-syntax-highlighting z extract web-search)`

---

## 安装pnpm

https://pnpm.io/zh/installation#%E5%9C%A8-posix-%E7%B3%BB%E7%BB%9F%E4%B8%8A

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

安装后重新source，并调整[[运维/容器与虚拟机/WSL/疑难问题解决#WSL会使用Windows的系统变量|该设置]]

---

## 安装nodejs

```bash
sudo apt update
sudo apt install nodejs
```

---

## 安装codex

```bash
pnpm install -g @openai/codex
```

---

## 配置codex

可参照如下：
https://docs.packyapi.com/docs/cli/codex#windows-%E9%85%8D%E7%BD%AE
https://codex.4399ai.chat/docs

- 这个参数确保打开的时候模型最高，并且执行命令不需要手动确认

```bash
codex --ask-for-approval never --sandbox danger-full-access -c model_reasoning_effort=high
```

- `resume`参数可以从历史记录中接续开始

> [!tip]
> 可以在Windows的powershell终端中，通过`wsl codex`直接在当前目录下使用codex，如果无法使用，[[运维/容器与虚拟机/WSL/疑难问题解决#无法直接从Windows终端中启用wsl子系统的程序|参看]]

---

# 压缩磁盘空间

Windows 中的 `ext4.vhdx` 是 WSL 使用的洗你磁盘镜像文件，WSL 系统里面的所有东西都在这里。当使用过多后，会发现体积很大。
![[Pasted image 20260108093609.png|425]]

可以使用 spacesniffer 观察 `\\wsl.localhost\Ubuntu\mnt\wslg\distro` 发现实际上并没有占用这么大的空间：
![[Pasted image 20260108093837.png]]

剩下的都是未回收的无用空间。

**压缩体积**：

网上会教使用 diskpart 进行 compact，但是单独使用这个工具并不能极致压缩。因为 compact 会回收全 0 的块，但是有些被标记成“未使用”的块中依然有数据，会造成逻辑上空闲，但是物理上依然占用空间的情况，因此，最好的是要**先把无用空间写零，再执行 compact**。

> [!danger] 问题
> wsl 动态调整磁盘大小，默认的最大上限太大，都写 0 的话写的太多，会影响 SSD 寿命。然而 wsl 调整已有的子系统的磁盘空间上限又比较麻烦，因此还没有好的办法，只能直接 diskpart 了。

- 关闭子系统

```powershell
wsl --shutdown
```

- 打开 diskpart 并执行compact

```powershell
diskpart
select vdisk file="E:\WSL\Ubuntu\ext4.vhdx"
attach vdisk readonly  # 只读模式挂载
compact vdisk          # 压缩操作
detach vdisk
exit
```

_通常收益不大，可以[[#快照/备份|重新导入]]来彻底压缩体积。_

---
