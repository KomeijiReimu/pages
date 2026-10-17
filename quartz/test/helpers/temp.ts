import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { access, mkdir, mkdtemp, readdir, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import type { TestContext } from "node:test"

export async function createTestDirectory(t: Pick<TestContext, "after">, prefix: string) {
  assert.match(prefix, /^[a-z0-9-]+$/)
  const configured = resolve(tmpdir())
  const forbidden = (path: string) => path === "/tmp" || path.startsWith("/tmp/")
  const candidate = forbidden(configured) ? "/var/tmp" : configured
  await mkdir(candidate, { recursive: true })
  const base = await realpath(candidate)
  if (forbidden(base)) throw new Error("Test TMPDIR must not resolve into /tmp")
  let gitRoot = ""
  try {
    gitRoot = execFileSync("git", ["-C", base, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    /* A standalone temporary root is expected not to belong to Git. */
  }
  if (gitRoot) throw new Error(`Test TMPDIR must be outside Git worktrees: ${base}`)
  const directory = await mkdtemp(join(base, prefix))
  t.after(async () => {
    assert.ok(directory.startsWith(base + sep))
    await rm(directory, { recursive: true, force: true, maxRetries: 3 })
    await assert.rejects(access(directory), { code: "ENOENT" })
    console.log("Temporary test directory removed:", directory)
  })
  return directory
}

// Run the real CLI without writing its compiler/content caches into the source
// checkout. Link source/dependencies, never copy or snapshot them; caches stay
// in real directories below the disposable workspace. NODE_OPTIONS must keep
// symlink module locations so the CLI's relative dynamic import stays here too.
export async function linkQuartzWorkspace(directory: string, source = process.cwd()) {
  await mkdir(join(directory, "quartz"), { recursive: true })
  for (const entry of await readdir(join(source, "quartz"))) {
    if (entry.startsWith(".")) continue
    await symlink(join(source, "quartz", entry), join(directory, "quartz", entry))
  }
  for (const entry of [
    "package.json",
    "node_modules",
    "quartz.config.ts",
    "quartz.layout.ts",
    "tsconfig.json",
  ]) {
    await symlink(join(source, entry), join(directory, entry))
  }
}
