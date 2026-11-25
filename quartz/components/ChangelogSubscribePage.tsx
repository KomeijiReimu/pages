import { renderToString } from "preact-render-to-string"
import { changelogSubscriptionUrls } from "./ChangelogSubscription"
import { pathToRoot, type FullSlug } from "../util/path"

export const subscribePageSlug = "changelog/subscribe/index" as FullSlug

export function renderChangelogSubscribePage(baseUrl: string | undefined, pageTitle: string) {
  const { feedUrl } = changelogSubscriptionUrls(baseUrl, subscribePageSlug)
  // Feedly’s publisher button encodes the whole feed ID: https://feedly.com/factory.html
  const reader = `https://feedly.com/i/subscription/${encodeURIComponent(`feed/${feedUrl}`)}`
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
            <p>把本站的更新日志添加到你的阅读器，有新内容时就能在那里看到。</p>
            <a class="komei-subscribe-reader" href={reader} rel="noreferrer">
              在 Feedly 中订阅 <span aria-hidden="true">↗</span>
            </a>
            <label for="rss-address">RSS 订阅地址</label>
            <p id="rss-address-help">使用其他阅读器时，把这个地址粘贴到「添加订阅」中。</p>
            <input
              id="rss-address"
              type="url"
              aria-describedby="rss-address-help"
              readOnly
              value={feedUrl}
            />
          </main>
        </body>
      </html>,
    )
  )
}
