import {removeUndefined} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"

/**
 * A NIP-92 media attachment, parsed from an `["imeta", "url …", "m …", …]` tag.
 * `fallbacks` and `extra` are always present when parsed; `extra` holds the
 * `key value` entries this type doesn't model (NIP-68's `annotate-user`, say) so
 * editing an event doesn't drop what another client wrote.
 */
export type Imeta = {
  url: string
  mimeType?: string
  blurhash?: string
  dim?: string
  alt?: string
  hash?: string
  fallbacks?: string[]
  extra?: string[]
}

// An imeta entry is a single string, its key separated from its value by a space —
// and the value may itself contain spaces, as alt text does.
const parseEntry = (entry: string): [string, string] => {
  const index = entry.indexOf(" ")

  return index === -1 ? [entry, ""] : [entry.slice(0, index), entry.slice(index + 1)]
}

/**
 * Parse a single `imeta` tag, or undefined for any other tag and for an `imeta`
 * tag with no url — an attachment nobody can fetch.
 */
export const parseImeta = (tag: string[]): Imeta | undefined => {
  if (tag[0] !== "imeta") return undefined

  const fallbacks: string[] = []
  const extra: string[] = []
  const imeta: Imeta = {url: "", fallbacks, extra}

  for (const entry of tag.slice(1)) {
    const [key, value] = parseEntry(entry)

    switch (key) {
      case "url":
        imeta.url = value
        break
      case "m":
        imeta.mimeType = value
        break
      case "blurhash":
        imeta.blurhash = value
        break
      case "dim":
        imeta.dim = value
        break
      case "alt":
        imeta.alt = value
        break
      case "x":
        imeta.hash = value
        break
      case "fallback":
        fallbacks.push(value)
        break
      default:
        extra.push(entry)
    }
  }

  if (imeta.url) {
    return imeta
  }
}

/**
 * Parse every `imeta` tag in a tag list. Writers use this to read the
 * attachments they're carrying, since they hold tags rather than an event.
 */
export const parseImetas = (tags: string[][]): Imeta[] => removeUndefined(tags.map(parseImeta))

/**
 * Render an attachment as an `imeta` tag. The entries this type doesn't model
 * are written back verbatim, so a round trip through `parseImeta` is lossless.
 */
export const renderImeta = (imeta: Imeta): string[] => {
  const entries: [string, string | undefined][] = [
    ["url", imeta.url],
    ["m", imeta.mimeType],
    ["blurhash", imeta.blurhash],
    ["dim", imeta.dim],
    ["alt", imeta.alt],
    ["x", imeta.hash],
  ]

  return [
    "imeta",
    ...entries.filter(([, value]) => value).map(([key, value]) => `${key} ${value}`),
    ...(imeta.fallbacks ?? []).map(url => `fallback ${url}`),
    ...(imeta.extra ?? []),
  ]
}

/**
 * Parse an event's NIP-92 `imeta` tags. A plain function so it can read
 * attachments off any event, regardless of kind, without a kind-specific reader.
 */
export const getImeta = (event: TrustedEvent): Imeta[] => parseImetas(event.tags)
