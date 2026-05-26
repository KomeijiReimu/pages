import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, resolveRelative } from "../../util/path"
import { FileTrieNode } from "../../util/fileTrie"

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
    const { tree, fileData, allFiles, cfg } = props

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
    const totalItems = subfolders.length + pagesInFolder.length

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: totalItems,
              })}
            </p>
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
                      📁
                    </span>
                    <span class="komei-folder-card__body">
                      <strong>{subfolder.title}</strong>
                      <small>{subfolder.count} 篇内容</small>
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

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
