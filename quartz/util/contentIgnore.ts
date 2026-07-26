import path from "path"
import { Repository } from "@napi-rs/simple-git"
import { isGitIgnored, type GlobbyFilterFunction } from "globby"
import { Minimatch, minimatch } from "minimatch"
import { toPosixPath } from "./glob"

export type ContentIgnoreMatcher = (relativePath: string) => boolean

type ContentIgnoreOptions = Readonly<{
  contentRoot: string
  ignorePatterns: string[]
  includeGitignored?: boolean
}>

function pathAndParents(relativePath: string): string[] {
  const paths: string[] = []
  let current = relativePath.replace(/^\.\//, "").replace(/\/$/, "")

  while (current && current !== ".") {
    paths.push(current)
    const parent = path.posix.dirname(current)
    if (parent === "." || parent === current) break
    current = parent
  }

  return paths
}

function normalizeIgnorePattern(pattern: string): string {
  // Match fast-glob's distinction between a negated pattern (`!foo`) and a
  // negative extglob (`!(*.md)`), which must retain its leading exclamation.
  return pattern.startsWith("!") && pattern[1] !== "(" ? pattern.slice(1) : pattern
}

function matchesPattern(candidate: string, pattern: string): boolean {
  const options = { dot: true, nonegate: true }
  return minimatch(candidate, pattern, options) || minimatch(`${candidate}/`, pattern, options)
}

function patternCanExcludeParent(pattern: string): boolean {
  if (pattern.endsWith("/**")) return true
  const basename = path.posix.basename(pattern)
  return !new Minimatch(basename, { nonegate: true }).hasMagic()
}

function matchesQuartzIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  const [target, ...parents] = pathAndParents(relativePath)
  if (target === undefined) return false

  return ignorePatterns.some((rawPattern) => {
    const pattern = normalizeIgnorePattern(rawPattern)
    if (matchesPattern(target, pattern)) return true

    // fast-glob only prunes a parent directory for patterns that can affect
    // traversal depth. Dynamic basenames such as `!(*.md)` only filter the
    // matching entry and must not hide every descendant of a directory.
    return (
      patternCanExcludeParent(pattern) && parents.some((parent) => matchesPattern(parent, pattern))
    )
  })
}

async function createGitIgnoreMatcher(contentRoot: string): Promise<GlobbyFilterFunction> {
  let repositoryRoot = contentRoot
  try {
    const repository = Repository.discover(contentRoot)
    repositoryRoot = repository.workdir() ?? contentRoot
  } catch {
    // A standalone content directory can still have its own .gitignore.
  }

  return isGitIgnored({ cwd: repositoryRoot })
}

export async function createContentIgnoreMatcher({
  contentRoot,
  ignorePatterns,
  includeGitignored = false,
}: ContentIgnoreOptions): Promise<ContentIgnoreMatcher> {
  const gitIgnored = includeGitignored ? undefined : await createGitIgnoreMatcher(contentRoot)

  return (eventPath) => {
    if (path.isAbsolute(eventPath)) return true

    const relativePath = toPosixPath(eventPath)
    const segments = relativePath.split("/")
    if (segments.some((segment) => segment.startsWith("."))) return true
    if (matchesQuartzIgnore(relativePath, ignorePatterns)) return true

    // Chokidar paths stay relative to contentRoot. Only the repository-level
    // Git matcher receives an absolute path so root .gitignore rules apply.
    return gitIgnored?.(path.resolve(contentRoot, relativePath)) ?? false
  }
}
