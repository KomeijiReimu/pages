---
title: KomeiReimu Blog Guide
---

# KomeiReimu Quartz V2 blog guide

This guide documents the KomeiReimu Quartz V2 blog theme in `/home/Brant/mysite/pages`. V2 turns the previous V1 Quartz-like shell into a Cynosura-inspired landing page and a Fuwari-inspired blog structure while keeping Quartz's article rendering, tags, graph, table of contents, backlinks, and static build model.

Current project decisions:

- Blog name: `KomeiReimu`.
- Domain: no real domain is configured yet, and the project must not invent a fake production domain.
- Analytics: disabled; `analytics` remains `null` in `quartz.config.ts`.
- Giscus: placeholder values only; comments are conditionally hidden until every real Giscus ID is configured.
- Notes: existing user notes should not be moved casually. The previous untracked `content/index.md` WSL note was preserved as `content/notes/wsl-command-note-preserved.md` because V2 needs a real homepage at `content/index.md`.

## Main files

| Path                                          | Purpose                                                            | Edit guidance                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `quartz/komeireimu.config.ts`                 | Central KomeiReimu theme, navigation, profile, background, filters | Preferred place for theme and content-module customization               |
| `quartz.layout.ts`                            | Quartz layout composition and conditional sidebars                 | Edit only when moving components between header/body/sidebars            |
| `quartz/styles/custom.scss`                   | Scoped KomeiReimu visual system and component styles               | Use existing `--komei-*` CSS variables; avoid one-off colors or spacing  |
| `quartz/components/TopNav.tsx`                | Config-driven top navigation                                       | Normally update `navLinks` in config instead of editing this component   |
| `quartz/components/HomeHero.tsx`              | Hero, profile card, social chips, primary/secondary actions        | Driven by config                                                         |
| `quartz/components/PostCards.tsx`             | Recent posts and `/posts/` timeline cards                          | Driven by blog filters in config                                         |
| `quartz/components/CategoryOverview.tsx`      | Directory/category cards                                           | Uses `categoryLabels` in config                                          |
| `quartz/components/TagCloud.tsx`              | Tag cloud/directory built from Quartz frontmatter tags             | Uses Quartz tag data; no client JavaScript required                      |
| `quartz/components/HomeModules.tsx`           | Skills/devices/projects/gallery-style homepage modules             | Driven by `homepage.modules` in config                                   |
| `content/index.md`                            | Real homepage route `/`                                            | Keep as homepage; do not store unrelated notes here                      |
| `content/posts/index.md`                      | Real posts route `/posts/`                                         | Add `komei-posts-index` class if the custom timeline should own the page |
| `content/categories/index.md`                 | Real categories route `/categories/`                               | Directory cards are rendered by layout                                   |
| `content/tags/index.md`                       | Real tag index route `/tags/`                                      | Quartz also emits per-tag pages such as `/tags/quartz/`                  |
| `content/about/index.md`                      | Real about route `/about/`                                         | Update bio/deployment notes here                                         |
| `content/notes/wsl-command-note-preserved.md` | Preserved user WSL note from the original home page                | Do not delete unless the user explicitly confirms it is no longer needed |

## Central theme configuration

Most KomeiReimu V2 customization should happen in `quartz/komeireimu.config.ts`. The file is intentionally independent from Quartz core emitters so it is easy to audit and migrate.

### Site identity

```ts
site: {
  name: "KomeiReimu",
  subtitle: "Cynosura notes · Fuwari routes",
  description: "...",
}
```

- `name` is used in the brand area.
- `subtitle` appears under the brand in the top navigation.
- `description` describes the shell and can be reused later for copy or metadata.

The browser/site title still comes from `quartz.config.ts`:

```ts
configuration: {
  pageTitle: "KomeiReimu",
  pageTitleSuffix: "",
  analytics: null,
}
```

Keep `analytics: null` until a provider is deliberately chosen and documented.

### Navigation links

```ts
navLinks: [
  { label: "首页", href: "/", description: "Cynosura-inspired landing" },
  { label: "文章", href: "/posts/", description: "Timeline of dated posts" },
  { label: "分类", href: "/categories/", description: "Directory-style categories" },
  { label: "标签", href: "/tags/", description: "Quartz tag index" },
  { label: "关于", href: "/about/", description: "Profile and site notes" },
]
```

Rules:

1. Every top navigation item should point to a real content route.
2. Use root-relative route strings with a leading slash, for example `/posts/`.
3. If you add optional friends/messages pages later, create matching Markdown files under `content/` before adding links.
4. Do not link to homepage anchors for posts/categories; V2 uses real routes.

### Profile and social chips

```ts
profile: {
  name: "KomeiReimu",
  handle: "@komeireimu",
  avatarInitials: "KR",
  status: "整理笔记、博客与小型作品中",
  location: "Quartz garden",
  bio: "...",
  socials: [
    { label: "RSS later", href: "/posts/", tone: "soft" },
    { label: "Tags", href: "/tags/", tone: "leaf" },
    { label: "About", href: "/about/", tone: "rose" },
  ],
}
```

- `avatarInitials` controls the text inside the profile avatar and nav mark.
- `socials` are internal route chips by default. If external links are needed later, update the component intentionally and document the external destination.
- `tone` maps to scoped CSS classes such as `.komei-chip--leaf` and `.komei-chip--rose`.

### Background values

The `background` object is injected by `quartz/components/KomeiTheme.tsx` as CSS variables:

```ts
background: {
  base: "var(--light)",
  wash: "color-mix(in srgb, var(--light) 84%, var(--lightgray) 16%)",
  primaryOrb: "color-mix(in srgb, var(--secondary) 24%, transparent)",
  secondaryOrb: "color-mix(in srgb, var(--tertiary) 22%, transparent)",
  grid: "color-mix(in srgb, var(--gray) 13%, transparent)",
  grainOpacity: "0.34",
}
```

`custom.scss` consumes these variables as:

- `--komei-bg-base`
- `--komei-bg-wash`
- `--komei-bg-orb-primary`
- `--komei-bg-orb-secondary`
- `--komei-bg-grid`
- `--komei-grain-opacity`

To change the background:

1. Prefer changing `background` in `komeireimu.config.ts`.
2. Use Quartz theme variables such as `var(--light)`, `var(--secondary)`, and `var(--tertiary)` so light/dark mode remains coherent.
3. If adding a new background primitive, add a new config key, emit it in `KomeiTheme.tsx`, then use the new CSS variable in `custom.scss`.
4. Do not add unrelated inline styles or hardcoded visual values inside JSX.

No background image is committed now. If one is added later, place the asset in a Quartz-supported static/content asset location, reference it through a config value, and document licensing/source.

### Blog filters

```ts
blog: {
  postSlugPrefixes: ["posts"],
  excludedSlugs: ["index", "posts/index", "categories/index", "tags/index", "about/index"],
  excludedSlugPrefixes: ["tags", "categories"],
  recentPostLimit: 5,
  tagCloudLimit: 24,
}
```

These filters prevent route pages and folder/tag indexes from being treated as normal posts. `PostCards` uses `isKomeiPostFile`, so a normal article should live under `content/posts/` and should not be named `index.md`.

If you want another section to appear in the post timeline later, add its root folder to `postSlugPrefixes` and verify that `/posts/`, homepage recent posts, and tag pages still behave as expected.

### Category labels

```ts
categoryLabels: {
  posts: { label: "文章", description: "...", accent: "var(--secondary)" },
  notes: { label: "笔记", description: "...", accent: "var(--tertiary)" },
}
```

The category directory groups content by top-level folder. For example:

- `content/posts/komeireimu-quartz-v2.md` contributes to `/posts/`.
- `content/notes/wsl-command-note-preserved.md` contributes to `/notes/` if a folder page is emitted.

To rename a visible category label, edit `label`. To change its card description, edit `description`. To change its accent color, use a token such as `var(--secondary)`, `var(--tertiary)`, or `var(--komei-accent-amber)`.

### Homepage modules

```ts
homepage: {
  hero: {
    eyebrow: "KomeiReimu Quartz V2",
    title: "...",
    lead: "...",
    primaryAction: { label: "阅读最新文章", href: "/posts/" },
    secondaryAction: { label: "浏览标签", href: "/tags/" },
  },
  modules: [
    {
      key: "skills",
      eyebrow: "Skills",
      title: "技能栈",
      description: "...",
      items: ["Quartz", "TypeScript", "Markdown", "Cloudflare Pages"],
    },
  ],
}
```

`HomeHero` renders the hero, actions, profile and social chips. `HomeModules` renders module cards for skills/devices/projects/gallery/music-like sections. To add a music, friends, gallery, or devices module, add an object to `homepage.modules`; use a stable `key` because it becomes part of the CSS class name.

## Layout behavior

`quartz.layout.ts` keeps Quartz core emitters intact and only changes component composition:

- Shared header: `KomeiTheme()` then `TopNav()`.
- Homepage (`slug === "index"`): `HomeHero`, recent post cards, category overview, tag cloud, and modules.
- List pages: no Explorer in the left sidebar.
- `/posts/`: renders a timeline version of `PostCards`.
- `/categories/`: renders category directory cards.
- `/tags/`: renders a tag cloud/directory and Quartz's tag index content.
- Article pages: keep Graph, desktop Table of Contents, and Backlinks on the right side.
- Giscus: wrapped in `ConditionalRender` and only rendered when `isKomeiGiscusConfigured()` returns true.

Avoid editing `quartz/components/renderPage.tsx` or emitter internals for normal theme changes. Prefer config, components, layout, and scoped styles.

## Writing content

### Homepage

Keep `content/index.md` as the real homepage. Do not put unrelated personal notes there. The page body can contain a short welcome note; most visual content is controlled by config and components.

### Posts

Create posts under `content/posts/`:

```md
---
title: Example Post
description: A short summary for cards and metadata.
date: 2026-04-28
tags:
  - quartz
  - blog/theme
comments: false
---

Write the post here.
```

Guidelines:

- Use `date` for published/created date. Quartz maps `date` to created and published date fields.
- Add `description` so cards and metadata are useful.
- Add `tags` for `/tags/` and per-tag pages.
- Keep `comments: false` until Giscus has real IDs if you want to be explicit per page.
- Do not name a normal article `index.md`; folder indexes are route pages.

### Categories

Categories are directory-based. The first path segment under `content/` is the category key. Examples:

```txt
content/posts/komeireimu-quartz-v2.md -> posts
content/notes/wsl-command-note-preserved.md -> notes
content/projects/my-project.md -> projects
```

The `/categories/` page displays category cards based on real content and `categoryLabels`.

### Tags

Quartz handles tags through frontmatter. Nested tags such as `blog/theme` also generate segment prefixes, so `blog` and `blog/theme` can both appear in the tag index.

Routes:

- `/tags/` shows the tag index.
- `/tags/quartz/` shows content tagged `quartz`.
- `/tags/blog/theme/` shows content tagged `blog/theme` if present.

## Giscus setup

Giscus remains placeholder-only in this repository. The current values live in `komeireimuConfig.giscus`:

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

Do not commit fake IDs. To enable comments later:

1. Choose the real public GitHub repository.
2. Enable GitHub Discussions.
3. Install and authorize the Giscus app.
4. Create or select a discussion category.
5. Copy the real `repo`, `repoId`, `category`, and `categoryId` from Giscus.
6. Replace every placeholder in `komeireimu.config.ts`.
7. Run validation and check a non-home article page.

Until all placeholders are replaced, `isKomeiGiscusConfigured()` returns false and comments are not rendered. This prevents placeholder comments or fake domains from appearing in the built site.

## Domain, RSS, sitemap, and Cloudflare Pages

No real domain is configured now. Do not add a fake `baseUrl` such as `example.com` or `komeireimu.example`.

Because RSS and sitemap canonical URLs need a real hostname, `quartz.config.ts` keeps:

```ts
Plugin.ContentIndex({
  enableSiteMap: false,
  enableRSS: false,
})
```

When a real Cloudflare Pages hostname or custom domain exists:

1. Set `configuration.baseUrl` in `quartz.config.ts` to the hostname only, without `https://` and without leading/trailing slashes.
2. Re-enable sitemap/RSS only if needed.
3. Document the chosen hostname and why it is safe to commit.

Recommended Cloudflare Pages settings:

| Setting                | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Framework preset       | `None`                                                            |
| Build command          | `npx quartz build`                                                |
| Build output directory | `public`                                                          |
| Root directory         | Repository directory that contains `quartz.config.ts`             |
| Node.js version        | Node 22 or another version compatible with `package.json` engines |

If Cloudflare shallow clones and Git-based dates are wrong, consider `git fetch --unshallow && npx quartz build`, but only after confirming the deployment environment needs it.

## What should and should not be committed

Safe to commit when intentionally changed:

- `quartz/komeireimu.config.ts`
- `quartz.layout.ts`
- `quartz/components/*.tsx` KomeiReimu components
- `quartz/styles/custom.scss`
- `content/**/*.md` that are real site content
- `docs/komeireimu-blog-guide.md`
- Existing package manifest changes if they are deliberate and necessary

Do not commit unrelated or generated files unless there is a specific reason:

- `.sisyphus/`
- `bun.lock` if the project is not switching to Bun
- `pnpm-lock.yaml` if the project is not switching to pnpm
- `public/` build output unless the repository policy explicitly tracks it
- `node_modules/`
- real secrets, tokens, analytics IDs, or unverified Giscus IDs

This task explicitly does not commit or push. A follow-up commit should be path-scoped and exclude unrelated untracked files.

## Validation commands

Run from `/home/Brant/mysite/pages`.

Available scripts in `package.json`:

```bash
npm run check
npm run test
npx quartz build
```

`npm run check` performs TypeScript checking and Prettier check. If it fails due to formatting, run `npm run format`, review the changed files, then rerun `npm run check`.

Manual pages to check after a build:

- `/` — should show the V2 hero/profile/modules and no Explorer.
- `/posts/` — should show the post timeline/list.
- `/categories/` — should show directory/category cards.
- `/tags/` — should show the tag index/tag cloud generated from frontmatter.
- `/about/` — should exist and explain current constraints.
- A normal article page such as `/posts/komeireimu-quartz-v2/` — may keep right-side Graph/TOC/Backlinks.

## Troubleshooting

### The homepage looks like default Quartz

Check that `content/index.md` exists, `quartz.layout.ts` renders `HomeHero`, `PostCards`, `CategoryOverview`, `TagCloud`, and `HomeModules` for `slug === "index"`, and `quartz/styles/custom.scss` is loaded.

### A top navigation link is broken

Confirm the matching content route exists:

- `/posts/` -> `content/posts/index.md`
- `/categories/` -> `content/categories/index.md`
- `/tags/` -> Quartz tag emitter plus `content/tags/index.md`
- `/about/` -> `content/about/index.md`

### A page appears in recent posts by mistake

Check `blog.excludedSlugs`, `blog.excludedSlugPrefixes`, and `postSlugPrefixes` in `komeireimu.config.ts`. Normal route pages should be excluded from `PostCards`.

### A category label looks wrong

Add or update the matching key in `categoryLabels`. The key should match the first folder segment under `content/`.

### Tags do not appear

Add `tags` frontmatter to a non-system content page. Route pages such as `index`, `categories/index`, and `tags/index` are intentionally ignored by the custom tag cloud.

### Giscus does not show

That is expected until real Giscus IDs are configured. Verify `isKomeiGiscusConfigured()` conditions in `komeireimu.config.ts` only after replacing placeholders with real values.

### Analytics appears unexpectedly

Check `quartz.config.ts` and custom scripts. For this V2 baseline, analytics should remain `null` and no tracking scripts should be added.
