import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import documentFamilyStyle from "../styles/documentFamily.scss"
import { transform } from "lightningcss"
import { byDateAndAlphabeticalFolderFirst, PageList, SortFn } from "../PageList"
import { DocumentFamilyPage } from "../DocumentFamilyPage"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { resolveRelative } from "../../util/path"
import { FileTrieNode } from "../../util/fileTrie"
import { getDocumentFamily } from "../../util/documentFamily"
import { getKomeiFolderTitle } from "../../komeijireimu.config"

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

// A persisted index.css can predate the family markup. Ship this scoped stylesheet with
// that markup, once per family page, outside the text extracted for popover previews.
const familyCss = transform({
  filename: "documentFamily.css",
  code: Buffer.from(documentFamilyStyle),
  minify: true,
}).code.toString()

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
      if (fileData.slug === "changelog/index") return <article>暂无公开的更新记录。</article>
      return null
    }

    const classes = (fileData.frontmatter?.cssclasses ?? []).join(" ")
    const family = getDocumentFamily(props.ctx, folder.slug)
    if (family) {
      return (
        <>
          <style dangerouslySetInnerHTML={{ __html: familyCss }} />
          <div class="popover-hint">
            <DocumentFamilyPage
              ctx={props.ctx}
              folder={folder}
              family={family}
              sort={options.sort ?? byDateAndAlphabeticalFolderFirst(props.cfg)}
            />
            {(tree as Root).children.length > 0 && (
              <article class={classes}>{htmlToJsx(fileData.filePath!, tree)}</article>
            )}
          </div>
        </>
      )
    }

    const subfolders = options.showSubfolders
      ? folder.children
          .filter((node) => node.isFolder)
          .map((node) => {
            const family = getDocumentFamily(props.ctx, node.slug)
            return {
              title: family ? getKomeiFolderTitle(node.slug, node.data?.title) : node.displayName,
              href: node.slug,
              count: countDescendantPages(node),
              family,
            }
          })
          .sort((left, right) => left.title.localeCompare(right.title))
      : []
    const pagesInFolder: QuartzPluginData[] = folder.children
      .filter((node) => node.data && !node.isFolder)
      .map((node) => node.data!)
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

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
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
                    href={resolveRelative(fileData.slug!, subfolder.href)}
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
                      <small>
                        {subfolder.family && "笔记家族 · "}
                        {subfolder.count} 篇笔记
                      </small>
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
