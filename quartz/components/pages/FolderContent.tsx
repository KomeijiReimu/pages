import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import documentFamilyStyle from "../styles/documentFamily.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, resolveRelative } from "../../util/path"
import { FileTrieNode } from "../../util/fileTrie"
import { getDocumentFamily } from "../../util/documentFamily"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

function countDescendantPages(node: FileTrieNode<any>): number {
  const selfCount = node.data && !node.slug.endsWith("/index") ? 1 : 0
  return selfCount + node.children.reduce((count, child) => count + countDescendantPages(child), 0)
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    const subfolders = options.showSubfolders
      ? folder.children
          .filter((node) => node.isFolder)
          .map((node) => ({
            title: node.displayName,
            href: node.slug,
            count: countDescendantPages(node),
          }))
          .sort((left, right) => left.title.localeCompare(right.title))
      : []
    const pagesInFolder: QuartzPluginData[] = folder.children
      .filter((node) => node.data && !node.isFolder)
      .map((node) => node.data!)
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: pagesInFolder,
    }
    const subfolderCount = subfolders.length
    const pageCount = pagesInFolder.length
    const folderSummary = [
      subfolderCount > 0 ? `${subfolderCount} 个子目录` : null,
      pageCount > 0 ? `${pageCount} 篇笔记` : null,
    ].filter(Boolean)

    const isDisplayIndex = ["categories/index", "posts/index", "posts/all/index"].includes(
      fileData.slug!,
    )
    const content = (
      (tree as Root).children.length === 0
        ? isDisplayIndex
          ? null
          : fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren
    const family = getDocumentFamily(props.ctx, fileData.slug!)

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        {family && (
          <section class="komei-document-family" aria-label="目录阅读引导">
            {family.description.trim() && (
              <p class="komei-document-family__description">{family.description}</p>
            )}
            <div class="komei-document-family__guide">
              <p class="komei-document-family__label">阅读起点</p>
              <p class="komei-document-family__notice">
                下级目录大部分为附属笔记，建议先阅读{" "}
                <a
                  class="internal"
                  href={resolveRelative(fileData.slug!, family.mainSlug)}
                  data-no-popover="true"
                >
                  {family.mainTitle}
                </a>
              </p>
              <a
                class="komei-document-family__button internal"
                href={resolveRelative(fileData.slug!, family.mainSlug)}
                data-no-popover="true"
              >
                阅读主笔记
                <span class="komei-document-family__arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </section>
        )}
        <div class="page-listing">
          {options.showFolderCount && folderSummary.length > 0 && (
            <p class="komei-folder-meta">{folderSummary.join(" · ")}</p>
          )}
          {subfolders.length > 0 && (
            <section class="komei-folder-section" aria-labelledby="komei-folder-section-title">
              <div class="komei-folder-section__heading">
                <h2 id="komei-folder-section-title">子目录</h2>
                <span>{subfolders.length} 个入口</span>
              </div>
              <div class="komei-folder-grid">
                {subfolders.map((subfolder) => (
                  <a
                    class="komei-folder-card internal"
                    href={resolveRelative(fileData.slug!, subfolder.href as FullSlug)}
                    data-no-popover="true"
                  >
                    <span class="komei-folder-card__icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <span class="komei-folder-card__body">
                      <strong>{subfolder.title}</strong>
                      <small>{subfolder.count} 篇笔记</small>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {pagesInFolder.length > 0 && (
            <section
              class="komei-folder-section komei-folder-section--notes"
              aria-labelledby="komei-note-section-title"
            >
              <div class="komei-folder-section__heading">
                <h2 id="komei-note-section-title">笔记</h2>
                <span>{pagesInFolder.length} 篇</span>
              </div>
              <PageList {...listProps} />
            </section>
          )}
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css, documentFamilyStyle)
  return FolderContent
}) satisfies QuartzComponentConstructor
