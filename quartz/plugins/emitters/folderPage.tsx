import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { ProcessedContent, QuartzPluginData, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { FullSlug, SimpleSlug, joinSegments, pathToRoot } from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { FolderContent } from "../../components"
import { write } from "./helpers"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { affectedFolderSlugs, publishedFolders } from "../../util/contentState"
import { getKomeiFolderTitle } from "../../komeijireimu.config"
interface FolderPageOptions extends FullPageLayout {
  sort?: (f1: QuartzPluginData, f2: QuartzPluginData) => number
}

async function* processFolderInfo(
  ctx: BuildCtx,
  folders: Set<SimpleSlug>,
  content: ProcessedContent[],
  opts: FullPageLayout,
  resources: StaticResources,
) {
  if (!folders.size) return
  const allFiles = content.map(([, file]) => file.data)
  const bySlug = new Map<string, ProcessedContent>(content.map((c) => [c[1].data.slug!, c]))
  for (const folder of folders) {
    const slug = joinSegments(folder, "index") as FullSlug
    // An authored index wins over the sibling note, regardless of parsing order.
    const [tree, file] =
      bySlug.get(slug) ??
      bySlug.get(folder) ??
      defaultProcessedContent({
        slug,
        frontmatter: {
          title: folder === "changelog" ? "更新日志" : getKomeiFolderTitle(folder),
          tags: [],
        },
      })
    const cfg = ctx.cfg.configuration
    const externalResources = pageResources(pathToRoot(slug), resources)
    const componentData: QuartzComponentProps = {
      ctx,
      fileData: file.data,
      externalResources,
      cfg,
      children: [],
      tree,
      allFiles,
    }

    const content = renderPage(cfg, slug, componentData, opts, externalResources)
    yield write({
      ctx,
      content,
      slug,
      ext: ".html",
    })
  }
}

export const FolderPage: QuartzEmitterPlugin<Partial<FolderPageOptions>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: FolderContent({ sort: userOpts?.sort }),
    ...userOpts,
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "FolderPage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      yield* processFolderInfo(ctx, publishedFolders(content), content, opts, resources)
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      const folders = affectedFolderSlugs(ctx, changeEvents, publishedFolders(content))
      yield* processFolderInfo(ctx, folders, content, opts, resources)
    },
  }
}
