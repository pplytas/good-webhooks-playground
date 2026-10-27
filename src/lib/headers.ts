export type ParsedHeaders = { headers: Record<string, string> } | { error: string }

/**
 * Parse "Name: value" lines into endpoint headers. Only the line format is checked here; the
 * library enforces reserved names, value characters, and size limits.
 */
export function parseHeaderLines(text: string): ParsedHeaders {
  const headers: Record<string, string> = {}
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon === -1) return { error: `Line ${index + 1} needs a colon, as in Name: value.` }
    const name = line.slice(0, colon).trim()
    if (!name) return { error: `Line ${index + 1} has no header name.` }
    // A record keeps one value per name, so a repeated line would be dropped silently.
    if (Object.hasOwn(headers, name)) return { error: `Header ${name} appears twice.` }
    headers[name] = line.slice(colon + 1).trim()
  }
  return { headers }
}
