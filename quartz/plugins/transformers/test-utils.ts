import { build } from "esbuild"

/** Load actual transformers without executing browser-only inline resources. No generated files. */
export async function loadMarkdownTestModules(): Promise<{
  ObsidianFlavoredMarkdown: typeof import("./ofm").ObsidianFlavoredMarkdown
  GitHubFlavoredMarkdown: typeof import("./gfm").GitHubFlavoredMarkdown
  CrawlLinks: typeof import("./links").CrawlLinks
  renderPage: typeof import("../../components/renderPage").renderPage
}> {
  const result = await build({
    stdin: {
      contents: [
        'export { ObsidianFlavoredMarkdown } from "./ofm"',
        'export { GitHubFlavoredMarkdown } from "./gfm"',
        'export { CrawlLinks } from "./links"',
        'export { renderPage } from "../../components/renderPage"',
      ].join("\n"),
      resolveDir: import.meta.dirname,
      loader: "ts",
    },
    write: false,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [
      {
        name: "inline-resources-and-external-modules",
        setup(builder) {
          builder.onResolve({ filter: /\.inline(?:\.(?:ts|scss))?$|\.scss$/ }, (args) => ({
            path: args.path,
            namespace: "inline-resource",
          }))
          builder.onLoad({ filter: /.*/, namespace: "inline-resource" }, () => ({
            contents: 'export default ""',
            loader: "js",
          }))
          builder.onResolve({ filter: /^[^./]/ }, (args) => ({
            path: import.meta.resolve(args.path),
            external: true,
          }))
        },
      },
    ],
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )
}
