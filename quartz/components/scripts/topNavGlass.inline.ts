;(() => {
  const flag = "data-komei-nav-glass-installed"
  if (document.documentElement.hasAttribute(flag)) return
  document.documentElement.setAttribute(flag, "true")

  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  const fine = matchMedia("(any-pointer: fine)")
  let dispose = () => {}

  const setup = () => {
    dispose()
    const header = document.querySelector<HTMLElement>(".komei-site-header")
    const glow = header?.querySelector<HTMLElement>(".komei-nav-glass__focus")
    if (!header || !glow) return
    const slug = document.body.dataset.slug ?? ""
    if (/^(notes|posts)\//.test(slug) && !slug.endsWith("/index")) return

    let frame = 0
    let pending: PointerEvent | null = null
    let live = true
    let hovering = false
    let initialized = false
    let lastTime = 0
    let lastInputX = 0
    let lastInputY = 0
    let lastInputAt = 0
    let strain = 0
    let directionX = 1
    let directionY = 0
    let tilt = 0
    let pressed = false
    const value = [0, 0, 84, 48, 0]
    const target = [...value]
    const velocity = value.map(() => 0)
    let baseWidth = 84
    let baseHeight = 48

    const enabled = () =>
      live &&
      !reduced.matches &&
      (fine.matches || navigator.maxTouchPoints === 0) &&
      header.classList.contains("is-detached")
    const stop = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      pending = null
      hovering = false
      strain = 0
      pressed = false
      lastTime = 0
      lastInputAt = 0
      header.dataset.glassActive = "false"
      initialized = false
      velocity.fill(0)
    }

    const paint = () => {
      glow.style.transform = `translate3d(${value[0] - 50}px,${value[1] - 22}px,0) rotate(${value[4]}deg) scale(${value[2] / 100},${value[3] / 44})`
    }

    const tick = (time: number) => {
      frame = 0
      if (!enabled()) return stop()
      const dt = lastTime ? Math.min(1.6, (time - lastTime) / 16.667) : 1
      lastTime = time
      if (pending) {
        const event = pending
        pending = null
        const rect = header.getBoundingClientRect()
        const item = event.target instanceof Element ? event.target.closest("a") : null
        const itemRect = item?.getBoundingClientRect()
        const elapsed = Math.max(12, event.timeStamp - lastInputAt)
        const dx = lastInputAt ? (event.clientX - lastInputX) / elapsed : 0
        const dy = lastInputAt ? (event.clientY - lastInputY) / elapsed : 0
        const speed = Math.hypot(dx, dy)
        // Preserve current spring position/velocity on reversal; only retarget the force.
        strain = Math.min(0.42, speed * 0.24)
        if (speed > 0.03) {
          directionX = Math.abs(dx) / speed
          directionY = Math.abs(dy) / speed
          tilt = Math.max(-24, Math.min(24, (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI))
        }
        lastInputX = event.clientX
        lastInputY = event.clientY
        lastInputAt = event.timeStamp
        target[0] = Math.max(24, Math.min(rect.width - 24, event.clientX - rect.left))
        target[1] = Math.max(20, Math.min(rect.height - 20, event.clientY - rect.top))
        baseWidth = Math.min(230, Math.max(78, (itemRect?.width ?? 64) + 20))
        baseHeight = Math.min(62, Math.max(48, (itemRect?.height ?? 40) + 10))
        if (!initialized) {
          value[0] = target[0]
          value[1] = target[1]
          initialized = true
        }
      }
      strain *= Math.pow(0.84, dt)
      const pressScale = pressed ? 0.96 : 1
      target[2] = baseWidth * (1 + strain * directionX - strain * directionY * 0.32) * pressScale
      target[3] = baseHeight * (1 + strain * directionY - strain * directionX * 0.32) * pressScale
      target[4] = tilt * Math.min(1, strain * 4)
      let moving = strain > 0.002
      const spring = hovering ? 0.21 : 0.105
      const damping = Math.pow(hovering ? 0.69 : 0.77, dt)
      for (let i = 0; i < value.length; i++) {
        velocity[i] = (velocity[i] + (target[i] - value[i]) * spring * dt) * damping
        value[i] += velocity[i] * dt
        if (Math.abs(target[i] - value[i]) > 0.12 || Math.abs(velocity[i]) > 0.1) moving = true
      }
      paint()
      if (pending || moving) frame = requestAnimationFrame(tick)
      else lastTime = 0
    }

    const queue = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !enabled()) return
      if (pending && pending.clientX === event.clientX && pending.clientY === event.clientY) return
      if (initialized && lastInputX === event.clientX && lastInputY === event.clientY) return
      hovering = true
      pending = event
      header.dataset.glassActive = "true"
      queue()
    }
    const leave = () => {
      hovering = false
      pressed = false
      pending = null
      lastInputAt = 0
      header.dataset.glassActive = "false"
      if (!enabled() || !initialized) return stop()
      const rect = header.getBoundingClientRect()
      const current = header.querySelector<HTMLElement>('[aria-current="page"]')
      const currentRect = current?.getBoundingClientRect()
      target[0] = currentRect
        ? currentRect.left - rect.left + currentRect.width / 2
        : rect.width / 2
      target[1] = currentRect
        ? currentRect.top - rect.top + currentRect.height / 2
        : rect.height / 2
      baseWidth = 78
      baseHeight = 44
      queue()
    }
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== "mouse" || !enabled()) return
      move(event)
      pressed = true
      queue()
    }
    const release = () => {
      if (!pressed) return
      pressed = false
      if (enabled()) queue()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) stop()
    }
    const sync = () => {
      if (!enabled()) stop()
    }
    const observer = new MutationObserver(sync)
    observer.observe(header, { attributes: true, attributeFilter: ["class"] })
    const resize = new ResizeObserver(() => {
      // Do not cancel a live pointer during the existing sticky-width transition.
      // The next pointer sample measures the current geometry before painting.
      if (!hovering) stop()
    })
    resize.observe(header)
    header.addEventListener("pointermove", move, { passive: true })
    header.addEventListener("pointerdown", press, { passive: true })
    window.addEventListener("pointerup", release, { passive: true })
    header.addEventListener("pointerleave", leave, { passive: true })
    header.addEventListener("pointercancel", stop)
    header.addEventListener("keydown", keyboard)
    reduced.addEventListener("change", sync)
    fine.addEventListener("change", sync)
    dispose = () => {
      live = false
      stop()
      observer.disconnect()
      resize.disconnect()
      header.removeEventListener("pointermove", move)
      header.removeEventListener("pointerdown", press)
      window.removeEventListener("pointerup", release)
      header.removeEventListener("pointerleave", leave)
      header.removeEventListener("pointercancel", stop)
      header.removeEventListener("keydown", keyboard)
      reduced.removeEventListener("change", sync)
      fine.removeEventListener("change", sync)
      glow.style.removeProperty("transform")
    }
    window.addCleanup(dispose)
  }

  document.addEventListener("nav", setup)
  window.addEventListener("pagehide", () => dispose())
  window.addEventListener("pageshow", setup)
})()
