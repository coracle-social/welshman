import {nip19} from "nostr-tools"

const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

const fromNostrURI = (s: string) => s.replace(/^nostr:\/?\/?/, "")

// Copy some types from nostr-tools because I can't import them

type AddressPointer = {
  identifier: string
  pubkey: string
  kind: number
  relays?: string[]
}

type EventPointer = {
  id: string
  relays?: string[]
  author?: string
  kind?: number
}

type ProfilePointer = {
  pubkey: string
  relays?: string[]
}

// Types

export type ParseContext = {
  results: Parsed[]
  content: string,
  tags: string[][]
}

export enum ParsedType {
  Address = "address",
  Cashu = "cashu",
  CodeBlock = "code_block",
  CodeInline = "code_inline",
  Ellipsis = "ellipsis",
  Event = "event",
  Invoice = "invoice",
  Link = "link",
  Newline = "newline",
  Profile = "profile",
  Text = "text",
  Topic = "topic",
}

export type ParsedCashu = {
  type: ParsedType.Cashu
  value: string
  raw: string
}

export type ParsedCodeBlock = {
  type: ParsedType.CodeBlock
  value: string
  raw: string
}

export type ParsedCodeInline = {
  type: ParsedType.CodeInline
  value: string
  raw: string
}

export type ParsedEllipsis = {
  type: ParsedType.Ellipsis
  value: string
  raw: string
}

export type ParsedInvoice = {
  type: ParsedType.Invoice
  value: string
  raw: string
}

export type ParsedLinkValue = {
  url: string
  hash: string
  meta: Record<string, string>
  isMedia: boolean
}

export type ParsedLink = {
  type: ParsedType.Link
  value: ParsedLinkValue
  raw: string
}

export type ParsedNewline = {
  type: ParsedType.Newline
  value: string
  raw: string
}

export type ParsedText = {
  type: ParsedType.Text
  value: string
  raw: string
}

export type ParsedTopic = {
  type: ParsedType.Topic
  value: string
  raw: string
}

export type ParsedEvent = {
  type: ParsedType.Event
  value: EventPointer
  raw: string
}

export type ParsedProfile = {
  type: ParsedType.Profile
  value: ProfilePointer
  raw: string
}

export type ParsedAddress = {
  type: ParsedType.Address
  value: AddressPointer
  raw: string
}

export type Parsed =
  ParsedAddress |
  ParsedCashu |
  ParsedCodeBlock |
  ParsedCodeInline |
  ParsedEllipsis |
  ParsedEvent |
  ParsedInvoice |
  ParsedLink |
  ParsedNewline |
  ParsedProfile |
  ParsedText |
  ParsedTopic

// Parsers for known formats

export const parseAddress = (raw: string, context: ParseContext): ParsedAddress | void => {
  const [naddr] = raw.match(/^(web\+)?(nostr:)?\/?\/?naddr1[\d\w]+/i) || []

  if (naddr) {
    try {
      const {data} = nip19.decode(fromNostrURI(naddr))

      return {type: ParsedType.Address, value: data as AddressPointer, raw}
    } catch (e) {
      // Pass
    }
  }
}

export const parseCashu = (raw: string, context: ParseContext): ParsedCashu | void => {
  const [value] = raw.match(/^(cashu)[\d\w=]{50,5000}/i) || []

  if (value) {
    return {type: ParsedType.Cashu, value, raw}
  }
}

export const parseCodeBlock = (raw: string, context: ParseContext): ParsedCodeBlock | void => {
  const [code, value] = raw.match(/^```([^]*?)```/i) || []

  if (code) {
    return {type: ParsedType.CodeBlock, value, raw}
  }
}

export const parseCodeInline = (raw: string, context: ParseContext): ParsedCodeInline | void => {
  const [code, value] = raw.match(/^`(.*?)`/i) || []

  if (code) {
    return {type: ParsedType.CodeInline, value, raw}
  }
}

export const parseEvent = (raw: string, context: ParseContext): ParsedEvent | void => {
  const [entity] = raw.match(/^(web\+)?(nostr:)?\/?\/?n(event|ote)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = nip19.decode(fromNostrURI(entity))
      const value = type === "note"
        ? {id: data as string, relays: []}
        : data as EventPointer

      return {type: ParsedType.Event, value, raw}
    } catch (e) {
      // Pass
    }
  }
}

export const parseInvoice = (raw: string, context: ParseContext): ParsedInvoice | void => {
  const [value] = raw.match(/^ln(lnbc|lnurl)[\d\w]{50,1000}/i) || []

  if (value) {
    return {type: ParsedType.Invoice, value, raw}
  }
}

export const parseLink = (raw: string, context: ParseContext): ParsedLink | void => {
  const [link] = raw.match(/^([a-z\+:]{2,30}:\/\/)?[^<>\(\)\s]+\.[a-z]{2,6}[^\s]*[^<>"'\.!?,:\s\)\(]/gi) || []

  if (!link) {
    return
  }

  const prev = last(context.results)

  // Skip url if it's just the end of a filepath
  if (prev?.type === ParsedType.Text && prev.value.endsWith("/")) {
    return
  }

  // Strip hash component
  let [url, hash] = link.split("#")

  // Skip ellipses and very short non-urls
  if (url.match(/\.\./)) {
    return
  }

  // Make sure there's a protocol
  if (!url.match("^\w+://")) {
    url = "https://" + url
  }

  const meta = Object.fromEntries(new URLSearchParams(hash).entries())

  for (const tag of context.tags) {
    if (tag[0] === 'imeta' && tag.find(t => t.includes(`url ${raw}`))) {
      Object.assign(meta, Object.fromEntries(tag.slice(1).map((m: string) => m.split(" "))))
    }
  }

  const isMedia = Boolean(
    url.match(/\.(jpe?g|png|wav|mp3|mp4|mov|avi|webm|webp|gif|bmp|svg)$/) &&
    last(url.replace(/\/$/, "").split("://"))?.includes("/")
  )

  const value = {url, hash, meta, isMedia}

  return {type: ParsedType.Link, value, raw}
}

export const parseNewline = (raw: string, context: ParseContext): ParsedNewline | void => {
  const [value] = raw.match(/^\n+/) || []

  if (value) {
    return {type: ParsedType.Newline, raw, value}
  }
}

export const parseProfile = (raw: string, context: ParseContext): ParsedProfile | void => {
  const [entity] = raw.match(/^(web\+)?(nostr:)?\/?\/?n(profile|pub)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = nip19.decode(fromNostrURI(entity))
      const value = type === "npub"
        ? {pubkey: data as string, relays: []}
        : data as ProfilePointer

      return {type: ParsedType.Profile, value, raw}
    } catch (e) {
      // Pass
    }
  }
}

export const parseTopic = (raw: string, context: ParseContext): ParsedTopic | void => {
  const [value] = raw.match(/^#[^\s!\"#$%&'()*+,-.\/:;<=>?@[\\\]^_`{|}~]+/i) || []

  // Skip numeric topics
  if (value && !value.match(/^#\d+$/)) {
    return {type: ParsedType.Topic, raw, value}
  }
}


// Parse other formats to known types

export const parseLegacyMention = (raw: string, context: ParseContext): ParsedProfile | ParsedEvent | void => {
  const mentionMatch = raw.match(/^#\[(\d+)\]/i) || []

  if (mentionMatch) {
    const [tag, value, url] = context.tags[parseInt(mentionMatch[1])] || []
    const relays = url ? [url] : []

    if (tag === "p") {
      return {type: ParsedType.Profile, value: {pubkey: value, relays}, raw}
    }

    if (tag === "e") {
      return {type: ParsedType.Event, value: {id: value, relays}, raw}
    }
  }
}

export const parsers = [
  parseNewline,
  parseLegacyMention,
  parseTopic,
  parseCodeBlock,
  parseCodeInline,
  parseAddress,
  parseProfile,
  parseEvent,
  parseCashu,
  parseInvoice,
  parseLink
]

export const parseNext = (raw: string, context: ParseContext): Parsed | void => {
  for (const parser of parsers) {
    const result = parser(raw, context)

    if (result) {
      return result
    }
  }
}

// Main exports

export const parse = ({content = "", tags = []}: {content?: string; tags?: string[][]}) => {
  const context: ParseContext = {content, tags, results: []}

  let buffer = ""
  let remaining = content.trim() || tags.find(t => t[0] === "alt")?.[1] || ""

  while (remaining) {
    const parsed = parseNext(remaining, context)

    if (parsed) {
      if (buffer) {
        context.results.push({type: ParsedType.Text, value: buffer, raw: buffer})
        buffer = ""
      }

      context.results.push(parsed)
      remaining = remaining.slice(parsed.raw.length)
    } else {
      // Instead of going character by character and re-running all the above regular expressions
      // a million times, try to match the next word and add it to the buffer
      const [match] = remaining.match(/^[\w\d]+ ?/i) || remaining[0]

      buffer += match
      remaining = remaining.slice(match.length)
    }
  }

  if (buffer) {
    context.results.push({type: ParsedType.Text, value: buffer, raw: buffer})
  }

  return context.results
}

type TruncateOpts = {
  minLength: number
  maxLength: number
  mediaLength: number
  entityLength: number
}

export const truncate = (
  content: Parsed[],
  {
    minLength = 400,
    maxLength = 600,
    mediaLength = 200,
    entityLength = 30,
  }: TruncateOpts,
) => {
  // Get a list of content sizes so we know where to truncate
  // Non-plaintext things might take up more or less room if rendered
  const sizes = content.map((parsed: Parsed) => {
    switch (parsed.type) {
      case ParsedType.Link:
      case ParsedType.Cashu:
      case ParsedType.Invoice:
        return mediaLength
      case ParsedType.Event:
      case ParsedType.Address:
      case ParsedType.Profile:
        return entityLength
      default:
        return parsed.value.length
    }
  })

  // If total size fits inside our max, we're done
  if (sizes.reduce((r, x) => r + x, 0) < maxLength) {
    return content
  }

  let currentSize = 0

  // Otherwise, truncate more then necessary so that when the user expands the note
  // they have more than just a tiny bit to look at. Truncating a single word is annoying.
  sizes.every((size, i) => {
    currentSize += size

    // Don't truncate down to nothing
    if (currentSize > minLength && i > 0) {
      content = content.slice(0, i)

      return false
    }


    return true
  })

  return content
}
