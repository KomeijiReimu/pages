import { renderToString } from "preact-render-to-string"
import { pathToRoot, type FullSlug } from "../util/path"

export const subscribePageSlug = "changelog/subscribe/index" as FullSlug

export function renderChangelogSubscribePage(feedUrl: string, pageTitle: string) {
  const root = pathToRoot(subscribePageSlug)
  return (
    "<!doctype html>" +
    renderToString(
      <html lang="zh-CN">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>订阅 RSS · {pageTitle}</title>
          <script src={`${root}/prescript.js`}></script>
          <link rel="stylesheet" href={`${root}/index.css`} />
          <link rel="alternate" type="application/rss+xml" title="更新日志" href={feedUrl} />
        </head>
        <body class="komei-subscribe-page">
          <main>
            <a href={`${root}/`}>
              <span aria-hidden="true">← </span>返回首页
            </a>
            <p class="komei-subscribe-kicker">更新日志</p>
            <h1>订阅 RSS</h1>
            <p>在你常用的阅读器里接收本站的更新日志。</p>
            <div class="komei-subscribe-address">
              <label for="rss-address">RSS 订阅地址</label>
              <p id="rss-address-help">
                复制地址，粘贴到阅读器的「添加订阅」中；也可以下载 OPML 文件导入。
              </p>
              <input
                id="rss-address"
                type="url"
                aria-describedby="rss-address-help"
                readOnly
                value={feedUrl}
              />
              <div class="komei-subscribe-actions">
                <button id="rss-copy" type="button" hidden>
                  复制 RSS 地址
                </button>
                <a href="./changelog.opml" download="changelog.opml">
                  下载 OPML
                </a>
              </div>
              <p id="rss-copy-status" role="status"></p>
            </div>
            <a href="../">查看更新日志</a>
          </main>
          <script src={`${root}/static/changelog-copy.js`}></script>
        </body>
      </html>,
    )
  )
}
