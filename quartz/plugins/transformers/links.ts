import { QuartzTransformerPlugin } from "../types"
import {
  FilePath,
  FullSlug,
  RelativeURL,
  resolveRelative,
  SimpleSlug,
  slugifyFilePath,
  TransformOptions,
  stripSlashes,
  simplifySlug,
  splitAnchor,
  transformLink,
} from "../../util/path"
import path from "path"
import fs from "fs"
import { visit } from "unist-util-visit"
import isAbsoluteUrl from "is-absolute-url"
import { Root } from "hast"

interface Options {
  /** How to resolve Markdown paths */
  markdownLinkResolution: TransformOptions["strategy"]
  /** Strips folders from a link so that it looks nice */
  prettyLinks: boolean
  openLinksInNewTab: boolean
  lazyLoad: boolean
  externalLinkIcon: boolean
}

const defaultOptions: Options = {
  markdownLinkResolution: "absolute",
  prettyLinks: true,
  openLinksInNewTab: false,
  lazyLoad: false,
  externalLinkIcon: true,
}

function splitResourceSuffix(src: string): [string, string] {
  const suffixIndex = src.search(/[?#]/)
  return suffixIndex === -1 ? [src, ""] : [src.slice(0, suffixIndex), src.slice(suffixIndex)]
}

type ResourceEntry = {
  filePath: FilePath
  slug: FullSlug
}

type ResourceIndex = {
  byPath: Map<string, ResourceEntry>
  byBasename: Map<string, ResourceEntry[]>
}

function normalizeResourcePathForLookup(resourcePath: string): string {
  return path.posix
    .normalize(resourcePath.replace(/\\/g, "/"))
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
}

function resourceLookupKey(resourcePath: string): string {
  return normalizeResourcePathForLookup(resourcePath).toLocaleLowerCase()
}

function buildResourceIndex(contentFiles: FilePath[]): ResourceIndex {
  const byPath = new Map<string, ResourceEntry>()
  const byBasename = new Map<string, ResourceEntry[]>()

  for (const filePath of contentFiles) {
    if (path.extname(filePath).toLocaleLowerCase() === ".md") continue

    const normalizedFilePath = normalizeResourcePathForLookup(filePath)
    const entry: ResourceEntry = {
      filePath: normalizedFilePath as FilePath,
      slug: slugifyFilePath(normalizedFilePath as FilePath),
    }
    byPath.set(resourceLookupKey(normalizedFilePath), entry)
    byPath.set(resourceLookupKey(entry.slug), entry)

    const basename = path.posix.basename(normalizedFilePath).toLocaleLowerCase()
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), entry])
    const slugBasename = path.posix.basename(entry.slug).toLocaleLowerCase()
    if (slugBasename !== basename) {
      byBasename.set(slugBasename, [...(byBasename.get(slugBasename) ?? []), entry])
    }
  }

  return { byPath, byBasename }
}

function resolveCaseInsensitiveSegment(parent: string, segment: string): string | undefined {
  const exact = path.join(parent, segment)
  if (fs.existsSync(exact)) return segment

  try {
    const lowerSegment = segment.toLocaleLowerCase()
    return fs.readdirSync(parent).find((entry) => entry.toLocaleLowerCase() === lowerSegment)
  } catch {
    return undefined
  }
}

function normalizeLocalResourceCasing(filePath: string | undefined, src: string): string {
  if (
    !filePath ||
    src.startsWith("/") ||
    src.startsWith("#") ||
    isAbsoluteUrl(src, { httpOnly: false })
  ) {
    return src
  }

  const [resourcePath, suffix] = splitResourceSuffix(src)
  const decodedPath = decodeURI(resourcePath)
  const segments = decodedPath.split("/").filter((segment) => segment.length > 0)
  if (segments.length === 0) return src

  let currentDir = path.dirname(filePath)
  const resolvedSegments: string[] = []

  for (const segment of segments) {
    if (segment === ".") continue
    if (segment === "..") {
      currentDir = path.dirname(currentDir)
      resolvedSegments.push(segment)
      continue
    }

    const resolvedSegment = resolveCaseInsensitiveSegment(currentDir, segment)
    if (!resolvedSegment) return src
    resolvedSegments.push(resolvedSegment)
    currentDir = path.join(currentDir, resolvedSegment)
  }

  return `${resolvedSegments.join("/")}${suffix}`
}

function resolveIndexedResource(
  index: ResourceIndex,
  currentSlug: FullSlug,
  currentFilePath: string | undefined,
  src: string,
): RelativeURL | undefined {
  if (!currentFilePath) return undefined

  const [rawResourcePath, suffix] = splitResourceSuffix(src)
  const decodedResourcePath = decodeURI(rawResourcePath)
  if (/^[a-zA-Z]:[\\/]/.test(decodedResourcePath)) return undefined

  const resourcePath = normalizeResourcePathForLookup(decodedResourcePath)
  const currentDir = path.posix.dirname(normalizeResourcePathForLookup(currentFilePath))
  const candidates = [
    path.posix.join(currentDir, resourcePath),
    resourcePath,
    path.posix.join(currentDir, "attachments", resourcePath),
    path.posix.join(currentDir, "i", resourcePath),
  ]

  for (const candidate of candidates) {
    const entry = index.byPath.get(resourceLookupKey(candidate))
    if (entry) return (resolveRelative(currentSlug, entry.slug) + suffix) as RelativeURL
  }

  const basenameMatches = index.byBasename.get(
    path.posix.basename(resourcePath).toLocaleLowerCase(),
  )
  if (basenameMatches?.length === 1) {
    return (resolveRelative(currentSlug, basenameMatches[0].slug) + suffix) as RelativeURL
  }

  return undefined
}

export const CrawlLinks: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "LinkProcessing",
    htmlPlugins(ctx) {
      const resourceIndex = buildResourceIndex(ctx.allFiles)
      return [
        () => {
          return (tree: Root, file) => {
            const curSlug = simplifySlug(file.data.slug!)
            const outgoing: Set<SimpleSlug> = new Set()

            const transformOptions: TransformOptions = {
              strategy: opts.markdownLinkResolution,
              allSlugs: ctx.allSlugs,
            }

            visit(tree, "element", (node, _index, _parent) => {
              // rewrite all links
              if (
                node.tagName === "a" &&
                node.properties &&
                typeof node.properties.href === "string"
              ) {
                let dest = node.properties.href as RelativeURL
                const classes = (node.properties.className ?? []) as string[]
                const isExternal = isAbsoluteUrl(dest, { httpOnly: false })
                classes.push(isExternal ? "external" : "internal")

                if (isExternal && opts.externalLinkIcon) {
                  node.children.push({
                    type: "element",
                    tagName: "svg",
                    properties: {
                      "aria-hidden": "true",
                      class: "external-icon",
                      style: "max-width:0.8em;max-height:0.8em",
                      viewBox: "0 0 512 512",
                    },
                    children: [
                      {
                        type: "element",
                        tagName: "path",
                        properties: {
                          d: "M320 0H288V64h32 82.7L201.4 265.4 178.7 288 224 333.3l22.6-22.6L448 109.3V192v32h64V192 32 0H480 320zM32 32H0V64 480v32H32 456h32V480 352 320H424v32 96H64V96h96 32V32H160 32z",
                        },
                        children: [],
                      },
                    ],
                  })
                }

                // Check if the link has alias text
                if (
                  node.children.length === 1 &&
                  node.children[0].type === "text" &&
                  node.children[0].value !== dest
                ) {
                  // Add the 'alias' class if the text content is not the same as the href
                  classes.push("alias")
                }
                node.properties.className = classes

                if (isExternal && opts.openLinksInNewTab) {
                  node.properties.target = "_blank"
                }

                // don't process external links or intra-document anchors
                const isInternal = !(
                  isAbsoluteUrl(dest, { httpOnly: false }) || dest.startsWith("#")
                )
                if (isInternal) {
                  dest = node.properties.href = transformLink(
                    file.data.slug!,
                    dest,
                    transformOptions,
                  )

                  // url.resolve is considered legacy
                  // WHATWG equivalent https://nodejs.dev/en/api/v18/url/#urlresolvefrom-to
                  const url = new URL(dest, "https://base.com/" + stripSlashes(curSlug, true))
                  const canonicalDest = url.pathname
                  let [destCanonical, _destAnchor] = splitAnchor(canonicalDest)
                  if (destCanonical.endsWith("/")) {
                    destCanonical += "index"
                  }

                  // need to decodeURIComponent here as WHATWG URL percent-encodes everything
                  const full = decodeURIComponent(stripSlashes(destCanonical, true)) as FullSlug
                  const simple = simplifySlug(full)
                  outgoing.add(simple)
                  node.properties["data-slug"] = full
                }

                // rewrite link internals if prettylinks is on
                if (
                  opts.prettyLinks &&
                  isInternal &&
                  node.children.length === 1 &&
                  node.children[0].type === "text" &&
                  !node.children[0].value.startsWith("#")
                ) {
                  node.children[0].value = path.basename(node.children[0].value)
                }
              }

              // transform all other resources that may use links
              if (
                ["img", "video", "audio", "iframe"].includes(node.tagName) &&
                node.properties &&
                typeof node.properties.src === "string"
              ) {
                if (opts.lazyLoad) {
                  if (["img", "iframe"].includes(node.tagName)) {
                    node.properties.loading = "lazy"
                  }

                  if (node.tagName === "img") {
                    node.properties.decoding = "async"
                  }

                  if (["video", "audio"].includes(node.tagName)) {
                    node.properties.preload ??= "metadata"
                  }
                }

                if (/^[a-zA-Z]:(?:[\\/]|%5C|%2F)/i.test(node.properties.src)) {
                  node.properties["data-missing-src"] = node.properties.src
                  delete node.properties.src
                  return
                }

                if (!isAbsoluteUrl(node.properties.src, { httpOnly: false })) {
                  if (node.properties.src.startsWith("/static/")) return
                  const currentFilePath = file.path
                    ? path.relative(path.resolve(ctx.argv.directory), file.path)
                    : file.data.filePath
                  let dest = normalizeLocalResourceCasing(file.path, node.properties.src)
                  const resolved = resolveIndexedResource(
                    resourceIndex,
                    file.data.slug!,
                    currentFilePath,
                    dest,
                  )

                  if (resolved) {
                    node.properties.src = resolved
                  } else {
                    node.properties["data-missing-src"] = node.properties.src
                    delete node.properties.src
                  }
                }
              }
            })

            file.data.links = [...outgoing]
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    links: SimpleSlug[]
  }
}
