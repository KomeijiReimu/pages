import { KomeiMusicTrack, komeireimuConfig } from "../komeireimu.config"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

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
      console.warn("音乐曲目地址无效，已作为展示条目处理：", error)
      return false
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

  const setupPlayer = (player) => {
    if (player.getAttribute("data-komei-music-bound") === "true") return
    player.setAttribute("data-komei-music-bound", "true")

    const audio = player.querySelector("[data-komei-music-audio]")
    const playButton = player.querySelector("[data-komei-music-play]")
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
    const playlistButtons = Array.from(player.querySelectorAll("[data-komei-music-track]"))
    const fallbackCover = player.getAttribute("data-cover-fallback") ?? ""
    let activeButton = playlistButtons.find((button) => button.getAttribute("aria-pressed") === "true") ?? playlistButtons[0]
    let selectionToken = 0

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

    const updatePlayState = (label) => {
      const playable = activeButton
        ? isPlayableSource(activeButton.getAttribute("data-source-kind"), activeButton.getAttribute("data-src"))
        : false

      playButton.disabled = !playable
      playButton.setAttribute("aria-disabled", playable ? "false" : "true")
      playButton.textContent = !playable ? "不可播放" : audio.paused ? "播放" : "暂停"
      if (currentState) currentState.textContent = label
      player.classList.toggle("is-playing", playable && !audio.paused)
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
      const lyrics = button.getAttribute("data-lyrics") ?? "暂无歌词或备注。"
      const cover = button.getAttribute("data-cover") || fallbackCover

      audio.pause()
      audio.removeAttribute("src")
      audio.load()

      if (playable && src) {
        audio.src = src
      }

      playlistButtons.forEach((trackButton) => {
        trackButton.setAttribute("aria-pressed", "false")
        trackButton.closest("li")?.classList.remove("is-active")
      })

      button.setAttribute("aria-pressed", "true")
      button.closest("li")?.classList.add("is-active")

      if (currentTitle) currentTitle.textContent = title
      if (currentArtist) currentArtist.textContent = artist
      if (currentMeta) currentMeta.textContent = album + " · " + mood
      if (currentLyrics) currentLyrics.textContent = lyrics
      if (coverTitle) coverTitle.textContent = title
      if (coverSubtitle) coverSubtitle.textContent = album
      if (coverImage instanceof HTMLImageElement) coverImage.src = cover
      setTags(currentTags, button.getAttribute("data-tags") ?? "")

      if (progress) progress.style.setProperty("--komei-track-progress", "0%")
      if (seek instanceof HTMLInputElement) seek.value = "0"
      if (currentTime) currentTime.textContent = "00:00 / " + (button.getAttribute("data-duration") ?? "--:--")
      updatePlayState(playable ? "已选择，等待播放" : "暂无可用音源，仅展示信息")
    }

    const togglePlayback = () => {
      if (!activeButton) return

      const token = selectionToken
      const selectedButton = activeButton
      const src = activeButton.getAttribute("data-src")
      const sourceKind = activeButton.getAttribute("data-source-kind")
      if (!isPlayableSource(sourceKind, src)) {
        updatePlayState("暂无可用音源，仅展示信息")
        return
      }

      if (!audio.src && src) audio.src = src

      if (audio.paused) {
        const playAttempt = audio.play()
        playAttempt
          .then(() => {
            if (token === selectionToken && selectedButton === activeButton) updatePlayState("正在播放")
          })
          .catch((error) => {
            if (token === selectionToken && selectedButton === activeButton) {
              updatePlayState("浏览器阻止播放，请再次点击播放")
            }
            console.warn("音乐播放请求被拒绝：", error)
          })
      } else {
        audio.pause()
        updatePlayState("已暂停")
      }
    }

    const handleSeek = () => {
      if (!(seek instanceof HTMLInputElement)) return
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return

      audio.currentTime = (Number(seek.value) / 100) * audio.duration
      updateProgress()
    }

    const handleEnded = () => {
      updatePlayState("播放结束")
      updateProgress()
    }

    const handlePause = () => {
      const playable = activeButton
        ? isPlayableSource(activeButton.getAttribute("data-source-kind"), activeButton.getAttribute("data-src"))
        : false
      updatePlayState(playable ? "已暂停" : "暂无可用音源，仅展示信息")
    }
    const handlePlay = () => updatePlayState("正在播放")

    playlistButtons.forEach((button) => {
      const handleSelect = () => selectTrack(button)
      button.addEventListener("click", handleSelect)
      window.addCleanup(() => button.removeEventListener("click", handleSelect))
    })

    playButton.addEventListener("click", togglePlayback)
    audio.addEventListener("timeupdate", updateProgress)
    audio.addEventListener("loadedmetadata", updateProgress)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("ended", handleEnded)
    if (seek) seek.addEventListener("input", handleSeek)

    window.addCleanup(() => {
      playButton.removeEventListener("click", togglePlayback)
      audio.removeEventListener("timeupdate", updateProgress)
      audio.removeEventListener("loadedmetadata", updateProgress)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("ended", handleEnded)
      if (seek) seek.removeEventListener("input", handleSeek)
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    })

    if (activeButton) selectTrack(activeButton)
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

const HomeModules: QuartzComponent = () => {
  const copy = komeireimuConfig.homepage.sections.modules
  const music = komeireimuConfig.homepage.music
  const tracks: readonly KomeiMusicTrack[] = music.tracks
  const activeTrack = tracks.find((track) => track.active) ?? tracks[0]
  const activeTrackCover = activeTrack.cover ?? music.coverFallback
  const activeTrackPlayable = isConfiguredPlayableTrack(activeTrack)

  return (
    <section class="komei-home-modules" aria-labelledby="komei-modules-title">
      <div class="komei-section-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="komei-modules-title">{copy.title}</h2>
      </div>
      <div class="komei-home-modules__grid">
        {komeireimuConfig.homepage.modules.map((module) =>
          module.key === "music" ? (
            <article class="komei-module-card komei-module-card--music">
              <div class="komei-module-card__header">
                <div>
                  <p class="komei-module-card__eyebrow">{module.eyebrow}</p>
                  <h3>{module.title}</h3>
                </div>
                <span>{music.label}</span>
              </div>
              <p>{module.description}</p>
              <div
                class="komei-music-player"
                data-cover-fallback={music.coverFallback}
                aria-label="可配置音乐播放器"
              >
                <audio data-komei-music-audio preload="metadata" />
                <div class="komei-music-player__cover" aria-hidden="true">
                  <img data-komei-music-cover src={activeTrackCover} alt="" loading="lazy" />
                  <span data-komei-music-cover-title>{activeTrack.title}</span>
                  <strong data-komei-music-cover-subtitle>
                    {activeTrack.album ?? activeTrack.artist}
                  </strong>
                </div>
                <div class="komei-music-player__body">
                  <div class="komei-music-player__now" aria-live="polite">
                    <button
                      type="button"
                      class="komei-music-player__play"
                      data-komei-music-play
                      disabled={!activeTrackPlayable}
                      aria-disabled={activeTrackPlayable ? "false" : "true"}
                    >
                      {activeTrackPlayable ? "播放" : "不可播放"}
                    </button>
                    <div>
                      <strong data-komei-music-current-title>{activeTrack.title}</strong>
                      <span data-komei-music-current-artist>{activeTrack.artist}</span>
                      <small data-komei-music-current-meta>
                        {activeTrack.album ?? "未标注专辑"} · {activeTrack.mood}
                      </small>
                    </div>
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
                  <p class="komei-music-player__time" data-komei-music-time>
                    00:00 / {activeTrack.duration}
                  </p>
                  <p class="komei-music-player__state" data-komei-music-state>
                    {activeTrackPlayable ? "未播放" : "暂无可用音源，仅展示信息"}
                  </p>
                  <p class="komei-music-player__lyrics" data-komei-music-lyrics>
                    {activeTrack.lyrics ?? "暂无歌词或备注。"}
                  </p>
                  <div class="komei-music-player__tags" data-komei-music-tags aria-label="曲目标签">
                    {activeTrack.tags.map((tag) => (
                      <span>{tag}</span>
                    ))}
                  </div>
                  <ol class="komei-music-player__playlist" aria-label="播放列表">
                    {tracks.map((track) => {
                      const trackPlayable = isConfiguredPlayableTrack(track)

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
                            data-mood={track.mood}
                            data-duration={track.duration}
                            data-lyrics={track.lyrics}
                            data-cover={track.cover ?? music.coverFallback}
                            data-tags={track.tags.join("|")}
                            aria-disabled={trackPlayable ? "false" : "true"}
                            aria-pressed={track.active ? "true" : "false"}
                            aria-label={`选择曲目 ${track.title}`}
                          >
                            <span>{track.title}</span>
                            <small>{track.mood}</small>
                            <time>{track.duration}</time>
                            <em>{trackPlayable ? "可播放" : "仅展示"}</em>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </div>
            </article>
          ) : (
            <article class={`komei-module-card komei-module-card--${module.key}`}>
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
