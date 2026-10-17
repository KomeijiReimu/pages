// Shared English/CJK encoding, preserving punctuation tokens such as C++ and [.
export function searchEncoder(str: string): string[] {
  const tokens: string[] = []
  let buffer = ""
  const flush = () => {
    if (buffer) tokens.push(buffer)
    buffer = ""
  }
  for (const char of str.toLowerCase()) {
    const code = char.codePointAt(0)!
    const cjk =
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x20000 && code <= 0x2a6df)
    if (cjk) {
      flush()
      tokens.push(char)
    } else if (/\s/u.test(char)) flush()
    else buffer += char
  }
  flush()
  return tokens
}

export function parseSearchQuery(raw: string): { query: string; tag?: string; tagsOnly: boolean } {
  const text = raw.trim()
  if (!text.startsWith("#")) return { query: text, tagsOnly: false }
  const [tag, ...rest] = text.slice(1).trim().split(/\s+/u)
  return rest.length
    ? { query: rest.join(" "), tag: tag.toLowerCase(), tagsOnly: false }
    : { query: tag, tagsOnly: true }
}
