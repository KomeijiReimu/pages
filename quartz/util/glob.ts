import path from "path"
import { FilePath } from "./path"
import { globby } from "globby"

export type GlobOptions = Readonly<{
  includeGitignored?: boolean
}>

export function toPosixPath(fp: string): string {
  return fp.split(path.sep).join("/")
}

export async function glob(
  pattern: string,
  cwd: string,
  ignorePatterns: string[],
  options?: GlobOptions,
): Promise<FilePath[]> {
  const fps = (
    await globby(pattern, {
      cwd,
      ignore: ignorePatterns,
      gitignore: !options?.includeGitignored,
    })
  ).map(toPosixPath)
  return fps as FilePath[]
}
