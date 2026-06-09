import {
  KomeiHomeModule,
  KomeiMusicTrack,
  KomeiMusicTrackLink,
  komeijireimuConfig,
} from "../komeijireimu.config"
import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const musicPlayerScript = `
(() => {
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "00:00"

    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0")
  }

  const isPlayableSource = (sourceKind, src) => {
    if (!src || sourceKind === "none") return false

    try {
      const url = new URL(src, window.location.href)

      if (sourceKind === "network") {
        return url.protocol === "https:"
      }

      if (sourceKind === "local") {
        return url.origin === window.location.origin
      }

      return false
    } catch (error) {
      console.warn("音乐曲目地址无效，已作为仅展示曲目处理：", error)
      return false
    }
  }

  const safeCoverLink = (link, isInternalLink) => {
    if (!link) return ""

    try {
      if (isInternalLink) {
        const url = new URL(link, window.location.href)
        return url.origin === window.location.origin ? link : ""
      }

      const url = new URL(link)
      return url.protocol === "https:" ? url.href : ""
    } catch (error) {
      console.warn("音乐曲目链接无效，已禁用封面跳转：", error)
      return ""
    }
  }

  const setTags = (tagsNode, tagsText) => {
    if (!tagsNode) return

    tagsNode.replaceChildren()
    const tags = tagsText.split("|").map((tag) => tag.trim()).filter(Boolean)
    tags.forEach((tag) => {
      const item = document.createElement("span")
      item.textContent = tag
      tagsNode.appendChild(item)
    })
  }

  const PLAYBACK_SLOW_NOTICE_MS = 45000

  const setupPlayer = (player) => {
    if (player.getAttribute("data-komei-music-bound") === "true") return
    player.setAttribute("data-komei-music-bound", "true")

    const audio = player.querySelector("[data-komei-music-audio]")
    const playButton = player.querySelector("[data-komei-music-play]")
    const playIcon = player.querySelector("[data-komei-music-play-icon]")
    const playLabel = player.querySelector("[data-komei-music-play-label]")
    const coverLink = player.querySelector("[data-komei-music-cover-link]")
    const coverImage = player.querySelector("[data-komei-music-cover]")
    const coverTitle = player.querySelector("[data-komei-music-cover-title]")
    const coverSubtitle = player.querySelector("[data-komei-music-cover-subtitle]")
    const currentTitle = player.querySelector("[data-komei-music-current-title]")
    const currentArtist = player.querySelector("[data-komei-music-current-artist]")
    const currentMeta = player.querySelector("[data-komei-music-current-meta]")
    const currentLyrics = player.querySelector("[data-komei-music-lyrics]")
    const currentTags = player.querySelector("[data-komei-music-tags]")
    const currentState = player.querySelector("[data-komei-music-state]")
    const currentTime = player.querySelector("[data-komei-music-time]")
    const progress = player.querySelector("[data-komei-music-progress]")
    const seek = player.querySelector("[data-komei-music-seek]")
    const playlist = player.querySelector(".komei-music-player__playlist")
    const playlistProgress = player.querySelector("[data-komei-music-list-progress]")
    const playlistButtons = Array.from(player.querySelectorAll("[data-komei-music-track]"))
    const fallbackCover = player.getAttribute("data-cover-fallback") ?? ""
    let activeButton = playlistButtons.find((button) => button.getAttribute("aria-pressed") === "true") ?? playlistButtons[0]
    let selectionToken = 0
    let playbackState = "idle"
    let needsReload = false
    let wantsPlayback = false
    let isResettingSource = false
    let slowNoticeTimer

    if (!(audio instanceof HTMLAudioElement) || !(playButton instanceof HTMLButtonElement)) return

    const updateProgress = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const current = duration > 0 ? audio.currentTime : 0
      const percent = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0
      const durationLabel = duration > 0 ? formatTime(duration) : (activeButton?.getAttribute("data-duration") ?? "--:--")

      if (progress) progress.style.setProperty("--komei-track-progress", String(percent) + "%")
      if (seek instanceof HTMLInputElement) seek.value = String(percent)
      if (currentTime) currentTime.textContent = formatTime(current) + " / " + durationLabel
    }

    const updatePlaylistScroll = () => {
      if (!(playlist instanceof HTMLElement)) return

      const scrollable = playlist.scrollHeight - playlist.clientHeight
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, playlist.scrollTop / scrollable)) : 0
      playlist.classList.toggle("is-scrollable", scrollable > 1)
      playlist.classList.toggle("is-scrolled-start", ratio > 0.02)
      playlist.classList.toggle("is-scrolled-end", ratio > 0.98 || scrollable <= 1)

      if (playlistProgress instanceof HTMLElement) {
        playlistProgress.style.setProperty("--komei-music-list-progress", String(ratio))
        playlistProgress.classList.toggle("is-visible", scrollable > 1)
        playlistProgress.classList.toggle("is-disabled", scrollable <= 1)
      }
    }

    const currentTrackPlayable = () =>
      activeButton
        ? isPlayableSource(activeButton.getAttribute("data-source-kind"), activeButton.getAttribute("data-src"))
        : false

    const clearSlowNoticeTimer = () => {
      if (slowNoticeTimer) window.clearTimeout(slowNoticeTimer)
      slowNoticeTimer = undefined
    }

    const scheduleSlowNotice = (token, selectedButton) => {
      clearSlowNoticeTimer()
      slowNoticeTimer = window.setTimeout(() => {
        if (token !== selectionToken || selectedButton !== activeButton || audio.paused) return
        if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          updatePlayState("网络较慢，继续加载中", "buffering")
        }
      }, PLAYBACK_SLOW_NOTICE_MS)
    }

    const resetAudioSource = (src) => {
      clearSlowNoticeTimer()
      isResettingSource = true
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
      if (src) audio.src = src
      needsReload = false
      window.setTimeout(() => {
        isResettingSource = false
      }, 0)
    }

    const updatePlayState = (label, state) => {
      const playable = activeButton
        ? isPlayableSource(activeButton.getAttribute("data-source-kind"), activeButton.getAttribute("data-src"))
        : false
      if (state) playbackState = state

      const isBusy = wantsPlayback && (playbackState === "loading" || playbackState === "buffering")
      const isError = playbackState === "error" || playbackState === "stalled"
      const isPlaying = playable && !audio.paused
      const iconState = !playable ? "unavailable" : isPlaying ? "playing" : "paused"
      const controlLabel = !playable
        ? "当前曲目仅展示"
        : needsReload || isError
          ? "重新加载当前曲目"
          : isPlaying || isBusy
            ? "暂停当前曲目"
            : "播放当前曲目"

      playButton.disabled = !playable
      playButton.setAttribute("aria-disabled", playable ? "false" : "true")
      playButton.setAttribute("aria-label", controlLabel)
      playButton.setAttribute("data-play-state", iconState)
      if (playIcon) playIcon.setAttribute("data-icon-state", iconState)
      if (playLabel) playLabel.textContent = controlLabel
      if (currentState) currentState.textContent = label
      player.classList.toggle("is-playing", isPlaying)
      player.classList.toggle("is-buffering", isBusy)
      player.classList.toggle("is-error", isError)
      player.classList.toggle("is-unavailable", !playable)
    }

    const selectTrack = (button) => {
      selectionToken += 1
      activeButton = button
      const sourceKind = button.getAttribute("data-source-kind")
      const src = button.getAttribute("data-src")
      const playable = isPlayableSource(sourceKind, src)
      const title = button.getAttribute("data-title") ?? "未命名曲目"
      const artist = button.getAttribute("data-artist") ?? "未知作者"
      const album = button.getAttribute("data-album") ?? "未标注专辑"
      const mood = button.getAttribute("data-mood") ?? "未标注氛围"
      const lyrics = button.getAttribute("data-lyrics") ?? ""
      const cover = button.getAttribute("data-cover") || fallbackCover
      const isInternalLink = button.getAttribute("data-link-internal") === "true"
      const link = safeCoverLink(button.getAttribute("data-link") ?? "", isInternalLink)

      wantsPlayback = false
      resetAudioSource(playable ? src : "")

      playlistButtons.forEach((trackButton) => {
        trackButton.setAttribute("aria-pressed", "false")
        trackButton.closest("li")?.classList.remove("is-active")
      })

      button.setAttribute("aria-pressed", "true")
      button.closest("li")?.classList.add("is-active")
      button.closest("li")?.scrollIntoView({ block: "nearest" })

      if (currentTitle) currentTitle.textContent = title
      if (currentArtist) currentArtist.textContent = artist
      if (currentMeta) currentMeta.textContent = album + (mood ? " · " + mood : "")
      if (currentLyrics) currentLyrics.textContent = lyrics
      if (coverTitle) coverTitle.textContent = title
      if (coverSubtitle) coverSubtitle.textContent = album
      if (coverImage instanceof HTMLImageElement) {
        coverImage.src = cover
        coverImage.alt = title + " 封面"
      }
      if (coverLink instanceof HTMLAnchorElement) {
        if (link) {
          coverLink.href = link
          coverLink.setAttribute("aria-disabled", "false")
          coverLink.setAttribute("aria-label", "打开 " + title + " 的曲目链接")
        } else {
          coverLink.removeAttribute("href")
          coverLink.setAttribute("aria-disabled", "true")
          coverLink.setAttribute("aria-label", title + " 曲目信息")
        }
        coverLink.classList.toggle("internal", isInternalLink)
        coverLink.classList.toggle("is-disabled", !link)
        if (link && !isInternalLink) {
          coverLink.setAttribute("rel", "noreferrer")
        } else {
          coverLink.removeAttribute("rel")
        }
      }
      setTags(currentTags, button.getAttribute("data-tags") ?? "")

      if (progress) progress.style.setProperty("--komei-track-progress", "0%")
      if (seek instanceof HTMLInputElement) seek.value = "0"
      if (currentTime) currentTime.textContent = "00:00 / " + (button.getAttribute("data-duration") ?? "--:--")
      updatePlaylistScroll()
      updatePlayState(playable ? "待播放" : "仅展示", playable ? "idle" : "unavailable")
    }

    const beginPlayback = (token, selectedButton, src) => {
      wantsPlayback = true
      if (needsReload || !audio.src) resetAudioSource(src)
      if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) audio.load()

      updatePlayState("加载中", "loading")
      scheduleSlowNotice(token, selectedButton)

      const playAttempt = audio.play()
      playAttempt
        .then(() => {
          if (token === selectionToken && selectedButton === activeButton && !audio.paused) {
            updatePlayState(audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? "播放中" : "加载中", audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? "playing" : "loading")
          }
        })
        .catch((error) => {
          if (token === selectionToken && selectedButton === activeButton) {
            needsReload = true
            clearSlowNoticeTimer()
            updatePlayState("加载失败，请再次点击", "error")
          }
          console.warn("音乐播放请求被拒绝：", error)
        })
    }

    const togglePlayback = () => {
      if (!activeButton) return

      const token = selectionToken
      const selectedButton = activeButton
      const src = activeButton.getAttribute("data-src")
      const sourceKind = activeButton.getAttribute("data-source-kind")
      if (!isPlayableSource(sourceKind, src)) {
        updatePlayState("仅展示", "unavailable")
        return
      }

      if (audio.paused || needsReload) {
        beginPlayback(token, selectedButton, src)
      } else {
        clearSlowNoticeTimer()
        wantsPlayback = false
        needsReload = false
        audio.pause()
        updatePlayState("已暂停", "paused")
      }
    }

    const handleSeek = () => {
      if (!(seek instanceof HTMLInputElement)) return
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return

      audio.currentTime = (Number(seek.value) / 100) * audio.duration
      updateProgress()
    }

    const handleEnded = () => {
      clearSlowNoticeTimer()
      wantsPlayback = false
      needsReload = false
      updatePlayState("已结束", "ended")
      updateProgress()
    }

    const handlePause = () => {
      if (isResettingSource) return
      clearSlowNoticeTimer()
      wantsPlayback = false
      if (playbackState === "error" || playbackState === "stalled") return
      updatePlayState(currentTrackPlayable() ? "已暂停" : "仅展示", currentTrackPlayable() ? "paused" : "unavailable")
    }
    const handleLoadStart = () => {
      if (wantsPlayback) updatePlayState("加载中", "loading")
    }
    const handleCanPlay = () => {
      if (wantsPlayback && !audio.paused) updatePlayState("缓冲完成，准备播放", "loading")
    }
    const handlePlaying = () => {
      clearSlowNoticeTimer()
      wantsPlayback = true
      needsReload = false
      updatePlayState("播放中", "playing")
    }
    const handleWaiting = () => {
      if (wantsPlayback && !audio.paused) updatePlayState("缓冲中", "buffering")
    }
    const handleStalled = () => {
      if (!wantsPlayback || audio.paused) return
      needsReload = true
      updatePlayState("网络停滞，点击可重试", "stalled")
    }
    const handleLoadFailure = () => {
      if (isResettingSource || (!wantsPlayback && audio.paused)) return
      needsReload = true
      clearSlowNoticeTimer()
      updatePlayState("加载失败，请再次点击", "error")
    }

    playlistButtons.forEach((button) => {
      const handleSelect = () => selectTrack(button)
      button.addEventListener("click", handleSelect)
      window.addCleanup(() => button.removeEventListener("click", handleSelect))
    })

    playButton.addEventListener("click", togglePlayback)
    const handleCoverLinkClick = (event) => {
      if (coverLink instanceof HTMLAnchorElement && !coverLink.getAttribute("href")) {
        event.preventDefault()
      }
    }

    if (coverLink) coverLink.addEventListener("click", handleCoverLinkClick)
    audio.addEventListener("timeupdate", updateProgress)
    audio.addEventListener("loadedmetadata", updateProgress)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("loadstart", handleLoadStart)
    audio.addEventListener("canplay", handleCanPlay)
    audio.addEventListener("playing", handlePlaying)
    audio.addEventListener("waiting", handleWaiting)
    audio.addEventListener("stalled", handleStalled)
    audio.addEventListener("error", handleLoadFailure)
    audio.addEventListener("abort", handleLoadFailure)
    audio.addEventListener("ended", handleEnded)
    if (seek) seek.addEventListener("input", handleSeek)
    if (playlist) playlist.addEventListener("scroll", updatePlaylistScroll, { passive: true })
    window.addEventListener("resize", updatePlaylistScroll, { passive: true })

    window.addCleanup(() => {
      playButton.removeEventListener("click", togglePlayback)
      if (coverLink) coverLink.removeEventListener("click", handleCoverLinkClick)
      audio.removeEventListener("timeupdate", updateProgress)
      audio.removeEventListener("loadedmetadata", updateProgress)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("loadstart", handleLoadStart)
      audio.removeEventListener("canplay", handleCanPlay)
      audio.removeEventListener("playing", handlePlaying)
      audio.removeEventListener("waiting", handleWaiting)
      audio.removeEventListener("stalled", handleStalled)
      audio.removeEventListener("error", handleLoadFailure)
      audio.removeEventListener("abort", handleLoadFailure)
      audio.removeEventListener("ended", handleEnded)
      if (seek) seek.removeEventListener("input", handleSeek)
      if (playlist) playlist.removeEventListener("scroll", updatePlaylistScroll)
      window.removeEventListener("resize", updatePlaylistScroll)
      clearSlowNoticeTimer()
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    })

    if (activeButton) selectTrack(activeButton)
    updatePlaylistScroll()
  }

  const setupAllPlayers = () => {
    document.querySelectorAll(".komei-music-player").forEach(setupPlayer)
  }

  document.addEventListener("nav", setupAllPlayers)
})()
`

function isConfiguredPlayableTrack(track: KomeiMusicTrack): boolean {
  if (!track.src || track.sourceKind === "none") return false

  if (track.sourceKind === "network") {
    try {
      return new URL(track.src).protocol === "https:"
    } catch {
      return false
    }
  }

  return !/^[a-z][a-z\d+.-]*:/i.test(track.src)
}

function isRouteHref(href: string): href is `/${string}` {
  return href.startsWith("/")
}

function routeHref(slug: FullSlug, href: `/${string}`): string {
  if (href === "/") return pathToRoot(slug)

  const route = href.replace(/^\/+|\/+$/g, "")
  return joinSegments(pathToRoot(slug), `${route}/`)
}

type ResolvedMusicTrackLink = {
  href?: string
  internal: boolean
}

function musicTrackLink(
  slug: FullSlug,
  link: KomeiMusicTrackLink | undefined,
): ResolvedMusicTrackLink {
  if (!link) return { internal: false }

  if (isRouteHref(link)) return { href: routeHref(slug, link), internal: true }

  try {
    const url = new URL(link)
    if (url.protocol === "https:") return { href: url.href, internal: false }
  } catch {
    return { internal: false }
  }

  return { internal: false }
}

const HomeModules: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug! as FullSlug
  const copy = komeijireimuConfig.homepage.sections.modules
  const music = komeijireimuConfig.homepage.music
  const modules = komeijireimuConfig.homepage.modules as readonly KomeiHomeModule[]
  const tracks: readonly KomeiMusicTrack[] = music.tracks
  const shouldRenderMusic = music.enabled && tracks.length > 0
  const activeTrack = shouldRenderMusic
    ? (tracks.find((track) => track.active) ?? tracks[0])
    : undefined
  const activeTrackCover = activeTrack
    ? (activeTrack.cover ?? music.coverFallback)
    : music.coverFallback
  const activeTrackPlayable = activeTrack ? isConfiguredPlayableTrack(activeTrack) : false
  const activeTrackLink = musicTrackLink(slug, activeTrack?.link)

  return (
    <section class="komei-home-modules" aria-labelledby="komei-modules-title">
      <div class="komei-section-heading">
        <div>
          <p>{copy.eyebrow}</p>
          <h2 id="komei-modules-title">{copy.title}</h2>
          {copy.description && <span>{copy.description}</span>}
        </div>
      </div>
      <div class="komei-home-modules__grid">
        {modules.map((module) =>
          module.key === "music" ? (
            shouldRenderMusic && activeTrack ? (
              <article class="komei-module-card komei-module-card--music">
                <div class="komei-module-card__header">
                  <div>
                    <p class="komei-module-card__eyebrow">{module.eyebrow}</p>
                    <h3>{module.title}</h3>
                  </div>
                </div>
                <p>{module.description}</p>
                <div
                  class="komei-music-player"
                  data-cover-fallback={music.coverFallback}
                  aria-label="音乐播放器"
                >
                  <audio data-komei-music-audio preload="metadata" />
                  <div class="komei-music-player__current">
                    <a
                      class={`${activeTrackLink.internal ? "internal " : ""}komei-music-player__cover${activeTrackLink.href ? "" : " is-disabled"}`}
                      data-komei-music-cover-link
                      href={activeTrackLink.href}
                      aria-disabled={activeTrackLink.href ? "false" : "true"}
                      aria-label={
                        activeTrackLink.href
                          ? `打开 ${activeTrack.title} 的曲目链接`
                          : `${activeTrack.title} 曲目信息`
                      }
                      rel={
                        activeTrackLink.href && !activeTrackLink.internal ? "noreferrer" : undefined
                      }
                    >
                      <img
                        data-komei-music-cover
                        src={activeTrackCover}
                        alt={`${activeTrack.title} 封面`}
                        loading="lazy"
                      />
                      <span class="komei-music-player__cover-caption" data-komei-music-cover-title>
                        {activeTrack.title}
                      </span>
                      <strong
                        class="komei-music-player__cover-caption"
                        data-komei-music-cover-subtitle
                      >
                        {activeTrack.album ?? activeTrack.artist}
                      </strong>
                    </a>
                    <div class="komei-music-player__now">
                      <button
                        type="button"
                        class="komei-music-player__play"
                        data-komei-music-play
                        disabled={!activeTrackPlayable}
                        aria-disabled={activeTrackPlayable ? "false" : "true"}
                        aria-label={activeTrackPlayable ? "播放当前曲目" : "当前曲目仅展示"}
                        data-play-state={activeTrackPlayable ? "paused" : "unavailable"}
                      >
                        <span class="komei-music-player__play-ring" aria-hidden="true">
                          <span
                            class="komei-music-player__play-icon"
                            data-komei-music-play-icon
                            data-icon-state={activeTrackPlayable ? "paused" : "unavailable"}
                          />
                        </span>
                        <span class="komei-music-player__play-label" data-komei-music-play-label>
                          {activeTrackPlayable ? "播放当前曲目" : "当前曲目仅展示"}
                        </span>
                      </button>
                      <div class="komei-music-player__now-copy">
                        <strong data-komei-music-current-title>{activeTrack.title}</strong>
                        <span data-komei-music-current-artist>{activeTrack.artist}</span>
                        <small data-komei-music-current-meta>
                          {activeTrack.album ?? "未标注专辑"}
                          {activeTrack.mood ? ` · ${activeTrack.mood}` : ""}
                        </small>
                      </div>
                      <p class="komei-music-player__time" data-komei-music-time>
                        00:00 / {activeTrack.duration}
                      </p>
                    </div>
                    <div
                      class="komei-music-player__progress"
                      data-komei-music-progress
                      style={{ "--komei-track-progress": "0%" }}
                    >
                      <span />
                    </div>
                    <input
                      class="komei-music-player__seek"
                      data-komei-music-seek
                      type="range"
                      min="0"
                      max="100"
                      value="0"
                      aria-label="调整当前曲目播放进度"
                    />
                    <p
                      class="komei-music-player__state"
                      data-komei-music-state
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {activeTrackPlayable ? "待播放" : "仅展示"}
                    </p>
                    <p class="komei-music-player__lyrics" data-komei-music-lyrics>
                      {activeTrack.lyrics ?? ""}
                    </p>
                    <div
                      class="komei-music-player__tags"
                      data-komei-music-tags
                      aria-label="曲目标签"
                    >
                      {activeTrack.tags.map((tag) => (
                        <span>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div class="komei-music-player__queue">
                    <div class="komei-music-player__queue-head">
                      <span>{music.label}</span>
                      <strong>{tracks.length} 首</strong>
                    </div>
                    <ol class="komei-music-player__playlist" aria-label="播放列表">
                      {tracks.map((track) => {
                        const trackPlayable = isConfiguredPlayableTrack(track)
                        const trackCover = track.cover ?? music.coverFallback
                        const trackMood = track.sourceKind === "none" ? "曲目信息" : track.mood
                        const trackLink = musicTrackLink(slug, track.link)

                        return (
                          <li
                            class={`${track.active ? "is-active " : ""}${trackPlayable ? "is-playable" : "is-unavailable"}`}
                          >
                            <button
                              type="button"
                              data-komei-music-track
                              data-source-kind={track.sourceKind}
                              data-src={track.src}
                              data-title={track.title}
                              data-artist={track.artist}
                              data-album={track.album}
                              data-mood={trackMood}
                              data-duration={track.duration}
                              data-lyrics={track.lyrics}
                              data-cover={track.cover ?? music.coverFallback}
                              data-link={trackLink.href}
                              data-link-internal={trackLink.internal ? "true" : "false"}
                              data-tags={track.tags.join("|")}
                              aria-disabled={trackPlayable ? "false" : "true"}
                              aria-pressed={track.active ? "true" : "false"}
                              aria-label={`选择曲目 ${track.title}`}
                            >
                              <img
                                class="komei-music-player__track-cover"
                                src={trackCover}
                                alt=""
                                loading="lazy"
                              />
                              <span class="komei-music-player__track-copy">
                                <strong>{track.title}</strong>
                                <small>
                                  <span>{track.artist}</span>
                                  <time>{track.duration}</time>
                                </small>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                    <div
                      class="komei-music-player__list-progress"
                      data-komei-music-list-progress
                      aria-hidden="true"
                    >
                      <span />
                    </div>
                  </div>
                </div>
              </article>
            ) : null
          ) : (
            <article class={`komei-module-card komei-module-card--${module.key}`}>
              {module.image && (
                <div class="komei-module-card__image" aria-hidden="true">
                  <img
                    src={module.image.src}
                    alt={module.image.alt}
                    loading="lazy"
                    style={
                      module.image.position
                        ? `object-position: ${module.image.position}`
                        : undefined
                    }
                  />
                </div>
              )}
              <div class="komei-module-card__header">
                <div>
                  <p class="komei-module-card__eyebrow">{module.eyebrow}</p>
                  <h3>{module.title}</h3>
                </div>
              </div>
              <p>{module.description}</p>
              <ul>
                {module.items.map((item) => (
                  <li>{item}</li>
                ))}
              </ul>
            </article>
          ),
        )}
      </div>
    </section>
  )
}

HomeModules.afterDOMLoaded = musicPlayerScript

export default (() => HomeModules) satisfies QuartzComponentConstructor
