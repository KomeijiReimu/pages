import type { BuildCtx, BuildTimeTrieData } from "../util/ctx"
import { getKomeiFolderTitle } from "../komeijireimu.config"
import { getDocumentFamily, type DocumentFamily } from "../util/documentFamily"
import type { FileTrieNode } from "../util/fileTrie"
import { resolveRelative } from "../util/path"
import type { SortFn } from "./PageList"

type Folder = FileTrieNode<BuildTimeTrieData>
type Group = { title: string; folder?: Folder; notes: BuildTimeTrieData[] }

export function DocumentFamilyPage({
  ctx,
  folder,
  family,
  sort,
}: {
  ctx: BuildCtx
  folder: Folder
  family: DocumentFamily
  sort: SortFn
}) {
  const groups: Group[] = []
  // The trie contains only published pages. Each folder remains a destination, even when
  // its own notes are empty. A nested family owns its entire subtree.
  function visit(node: Folder, title: string) {
    const notes = node.children
      .filter((child) => !child.isFolder && child.slug !== family.mainSlug)
      .map((child) => child.data!)
      .sort(sort)
    if (node !== folder || notes.length)
      groups.push({ title, folder: node === folder ? undefined : node, notes })

    const subfolders = node.children
      .filter((child) => child.isFolder)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    for (const child of subfolders) {
      const childFamily = getDocumentFamily(ctx, child.slug)
      const name = childFamily
        ? getKomeiFolderTitle(child.slug, child.data?.title)
        : child.displayName
      const childTitle = title ? `${title} / ${name}` : name
      if (childFamily) groups.push({ title: childTitle, folder: child, notes: [] })
      else visit(child, childTitle)
    }
  }
  visit(folder, "")

  const total = groups.reduce((sum, group) => sum + group.notes.length, 0)
  const indexLabel = total ? "从属笔记" : "子目录"
  const guide = total
    ? "建议先读主笔记，再沿文中的链接阅读从属笔记；也可以从下方直接选读。"
    : groups.length
      ? "建议先读主笔记，再按需要浏览下方的子目录。"
      : "可以从主笔记开始阅读。"

  return (
    <div class="kfn-family">
      <section class="kfn-bookplate" aria-labelledby="kfn-identity">
        <svg
          class="kfn-volumes"
          viewBox="0 0 84 80"
          width="84"
          height="80"
          aria-hidden="true"
          focusable="false"
        >
          <g fill="var(--kfn-paper)" stroke="var(--kfn-line)" stroke-linejoin="round">
            <rect x="34" y="13" width="37" height="53" rx="2" transform="rotate(15 52 40)" />
            <rect x="28" y="11" width="39" height="55" rx="2" transform="rotate(5 48 39)" />
          </g>
          <g transform="rotate(-8 38 40)">
            <path
              d="M22 11H61V66H22Q18 66 18 62V15Q18 11 22 11Z"
              fill="var(--kfn-paper)"
              stroke="var(--kfn-cover)"
              stroke-width="1.4"
            />
            <path d="M49 60H55V72L52 69L49 72Z" fill="var(--kfn-ribbon)" />
            <path d="M22 10H60V60H22Q19 60 18 63V14Q18 10 22 10Z" fill="var(--kfn-cover)" />
            <path d="M24 11V59M22 63H47M56 63H60" fill="none" stroke="var(--kfn-line)" />
            <g fill="none" stroke="var(--kfn-paper)" stroke-width="1.2">
              <path d="M42 24L46 29L42 34L38 29Z M31 29H36 M48 29H53" />
              <path d="M36 39H48" opacity=".65" />
            </g>
          </g>
        </svg>
        <h2 class="kfn-heading" id="kfn-identity">
          这是一个笔记家族
        </h2>
        <p class="kfn-guide">{guide}</p>
      </section>
      {family.description && <p class="kfn-description">{family.description}</p>}
      <nav class="kfn-choices" aria-label="选择笔记">
        <a
          class="kfn-choice internal"
          href={resolveRelative(folder.slug, family.mainSlug)}
          data-no-popover="true"
        >
          <span class="kfn-kind">主笔记</span>
          <span class="kfn-destination">
            <span>{family.mainTitle}</span>
            <span class="kfn-arrow" aria-hidden="true">
              →
            </span>
          </span>
        </a>
        {groups.length > 0 && (
          <a class="kfn-choice kfn-jump" href="#kfn-notes" data-router-ignore>
            <span class="kfn-kind">{indexLabel}</span>
            <span class="kfn-destination">
              <span>浏览 {total ? `${total} 篇` : `${groups.length} 个目录`}</span>
              <span class="kfn-arrow" aria-hidden="true">
                ↓
              </span>
            </span>
          </a>
        )}
      </nav>
      {groups.length > 0 && (
        <section class="kfn-index" id="kfn-notes" aria-label={indexLabel} tabIndex={-1}>
          {groups.map((group) => (
            <div class="kfn-group">
              <h2 class="kfn-group-title">
                {group.folder ? (
                  <a
                    class="kfn-folder internal"
                    href={resolveRelative(folder.slug, group.folder.slug)}
                    data-no-popover="true"
                  >
                    {group.title}
                    <span aria-hidden="true"> ›</span>
                  </a>
                ) : (
                  "当前目录"
                )}
              </h2>
              {group.notes.length > 0 && (
                <ul class="kfn-notes">
                  {group.notes.map((note) => (
                    <li>
                      <a
                        class="kfn-note internal"
                        href={resolveRelative(folder.slug, note.slug)}
                        data-no-popover="true"
                      >
                        {note.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
