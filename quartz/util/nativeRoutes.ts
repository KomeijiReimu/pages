/** Uncompressed final HTML bytes; archive/sidecar sizes are not navigation costs. */
export const maxSpaResponseBytes = 260_000

declare global {
  interface Window {
    quartzNativeRoutes?: Set<string>
  }
}

export function isKnownNativeRoute(url: URL): boolean {
  if (url.origin !== window.location.origin || !window.quartzNativeRoutes) return false
  // Decode per segment so an encoded slash cannot turn into a different route.
  let pathname: string
  try {
    pathname = url.pathname
      .split("/")
      .map((s) => encodeURIComponent(decodeURIComponent(s)))
      .join("/")
  } catch {
    return false // Malformed URLs remain the browser/server's responsibility.
  }
  return window.quartzNativeRoutes.has(pathname.replace(/\.html$/, ""))
}
