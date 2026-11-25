import { joinSegments, pathToRoot, type FullSlug } from "../util/path"

const feedPath = "changelog/feed.xml"

export function changelogSubscriptionUrls(baseUrl: string | undefined, slug: FullSlug) {
  if (!baseUrl) throw new Error("Changelog email subscriptions require cfg.baseUrl")
  const feedUrl = `https://${joinSegments(baseUrl, feedPath)}`
  return {
    feedUrl,
    mail: `https://feedrabbit.com/subscriptions/new?url=${encodeURIComponent(feedUrl)}`,
    rss: joinSegments(pathToRoot(slug), feedPath),
  }
}

export function ChangelogSubscription({ baseUrl, slug }: { baseUrl?: string; slug: FullSlug }) {
  const { mail, rss } = changelogSubscriptionUrls(baseUrl, slug)
  return (
    <nav class="komei-changelog-subscription" aria-label="订阅更新日志">
      <span class="komei-changelog-subscription__label">更新日志</span>
      <span class="komei-changelog-subscription__links">
        <a href={mail} aria-label="邮件订阅更新日志（Feedrabbit）">
          邮件订阅
        </a>
        <a href={rss} type="application/rss+xml" data-router-ignore aria-label="RSS 订阅更新日志">
          RSS
        </a>
      </span>
    </nav>
  )
}
