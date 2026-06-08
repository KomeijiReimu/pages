import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/footer.scss"

interface Options {
  links: Record<string, string>
  icp?: {
    text: string
    href?: string
    showOnSlugs?: string[]
  }
}

export default ((opts?: Options) => {
  const Footer: QuartzComponent = ({ displayClass, cfg, fileData }: QuartzComponentProps) => {
    const year = new Date().getFullYear()
    const links = opts?.links ?? []
    const icp = opts?.icp
    const slug = String(fileData.slug ?? "")
    const shouldShowIcp = icp && (icp.showOnSlugs?.includes(slug) ?? true)

    return (
      <footer class={`${displayClass ?? ""}`}>
        <p>
          {cfg.pageTitle} © {year}
        </p>
        {shouldShowIcp && (
          <p class="footer-icp">{icp.href ? <a href={icp.href}>{icp.text}</a> : icp.text}</p>
        )}
        <ul>
          {Object.entries(links).map(([text, link]) => (
            <li>
              <a href={link}>{text}</a>
            </li>
          ))}
        </ul>
      </footer>
    )
  }

  Footer.css = style
  return Footer
}) satisfies QuartzComponentConstructor
