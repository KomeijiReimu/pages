import { StaticResources } from "../util/resources"
import { FilePath, FullSlug } from "../util/path"
import { BuildCtx } from "../util/ctx"

export function getStaticResourcesFromPlugins(ctx: BuildCtx) {
  const staticResources: StaticResources = {
    css: [],
    js: [],
    additionalHead: [],
  }

  for (const transformer of [...ctx.cfg.plugins.transformers, ...ctx.cfg.plugins.emitters]) {
    const res = transformer.externalResources ? transformer.externalResources(ctx) : {}
    if (res?.js) {
      staticResources.js.push(...res.js)
    }
    if (res?.css) {
      staticResources.css.push(...res.css)
    }
    if (res?.additionalHead) {
      staticResources.additionalHead.push(...res.additionalHead)
    }
  }

  // if serving locally, listen for rebuilds and reload the page
  if (ctx.argv.serve) {
    const remoteDevHost = ctx.argv.remoteDevHost ?? ""

    staticResources.js.push({
      loadTime: "afterDOMReady",
      contentType: "inline",
      script: `
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const configuredHost = ${JSON.stringify(remoteDevHost)}
        const wsPort = ${JSON.stringify(String(ctx.argv.wsPort))}
        function liveReloadUrl() {
          if (configuredHost) {
            try {
              const url = configuredHost.includes('://')
                ? new URL(configuredHost)
                : new URL(protocol + '//' + configuredHost)
              if (!url.port) url.port = wsPort
              return url.toString()
            } catch {}
          }
          return protocol + '//' + (location.hostname || 'localhost') + ':' + wsPort
        }
        const socket = new WebSocket(liveReloadUrl())
        // reload(true) ensures resources like images and scripts are fetched again in firefox
        socket.addEventListener('message', () => document.location.reload(true))
      `,
    })
  }

  return staticResources
}

export * from "./transformers"
export * from "./filters"
export * from "./emitters"

declare module "vfile" {
  // inserted in processors.ts
  interface DataMap {
    slug: FullSlug
    filePath: FilePath
    relativePath: FilePath
  }
}
