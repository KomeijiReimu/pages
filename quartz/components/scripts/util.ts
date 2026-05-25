export function registerEscapeHandler(outsideContainer: HTMLElement | null, cb: () => void) {
  if (!outsideContainer) return
  function click(this: HTMLElement, e: HTMLElementEventMap["click"]) {
    if (e.target !== this) return
    e.preventDefault()
    e.stopPropagation()
    cb()
  }

  function esc(e: HTMLElementEventMap["keydown"]) {
    if (!e.key.startsWith("Esc")) return
    e.preventDefault()
    cb()
  }

  outsideContainer?.addEventListener("click", click)
  window.addCleanup(() => outsideContainer?.removeEventListener("click", click))
  document.addEventListener("keydown", esc)
  window.addCleanup(() => document.removeEventListener("keydown", esc))
}

export function removeAllChildren(node: HTMLElement) {
  while (node.firstChild) {
    node.removeChild(node.firstChild)
  }
}

// AliasRedirect emits HTML redirects which also have the link[rel="canonical"]
// containing the URL it's redirecting to.
// Extracting it here with regex is _probably_ faster than parsing the entire HTML
// with a DOMParser effectively twice (here and later in the SPA code), even if
// way less robust - we only care about our own generated redirects after all.
const canonicalRegex = /<link rel="canonical" href="([^"]*)">/

type FetchCanonicalOptions = {
  signal?: AbortSignal
  maxBytes?: number
}

function getContentLength(res: Response): number {
  return Number(res.headers.get("content-length") ?? 0)
}

export async function fetchCanonical(
  url: URL,
  optionsOrSignal?: FetchCanonicalOptions | AbortSignal,
): Promise<Response> {
  const options: FetchCanonicalOptions =
    optionsOrSignal instanceof AbortSignal ? { signal: optionsOrSignal } : (optionsOrSignal ?? {})
  const res = await fetch(`${url}`, { signal: options.signal })
  if (!res.headers.get("content-type")?.startsWith("text/html")) {
    return res
  }

  const contentLength = getContentLength(res)
  if (options.maxBytes && Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    return res
  }

  // reading the body can only be done once, so we need to clone the response
  // to allow the caller to read it if it's was not a redirect
  const text = await res.clone().text()
  const [_, redirect] = text.match(canonicalRegex) ?? []
  return redirect ? fetch(`${new URL(redirect, url)}`, { signal: options.signal }) : res
}
