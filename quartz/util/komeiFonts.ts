// An explicit public UI alphabet, NOT a corpus-derived font or an article font.
// The checked-in manifest records source URLs, real weights, sizes and hashes.
export const criticalUiText =
  Array.from({ length: 95 }, (_, i) => String.fromCodePoint(i + 32)).join("") +
  "的博客首页归档文章标签关于不动大图书馆相信心就是你魔法阅读最新浏览知识幻想乡。最近个人空间查看继续"

export const criticalFonts = [
  { file: "sans-400.woff2", family: "Komei UI Sans", weight: 400 },
  { file: "sans-600.woff2", family: "Komei UI Sans", weight: 600 },
  { file: "serif-500.woff2", family: "Komei UI Serif", weight: 500 },
  { file: "serif-700.woff2", family: "Komei UI Serif", weight: 700 },
]

export function criticalFontStyle(baseDir: string) {
  const range = [...new Set(Array.from(criticalUiText, (c) => c.codePointAt(0)!))]
    .sort((a, b) => a - b)
    .map((c) => `U+${c.toString(16)}`)
    .join(",")
  return criticalFonts
    .map(
      (font) => `@font-face {
  font-family: "${font.family}";
  font-style: normal;
  font-weight: ${font.weight};
  font-display: optional;
  src: url("${baseDir}/static/fonts/startup/${font.file}") format("woff2");
  unicode-range: ${range};
}`,
    )
    .join("\n")
}
