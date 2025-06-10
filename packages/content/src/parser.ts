import {decode} from "nostr-tools/nip19"

const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

const fromNostrURI = (s: string) => s.replace(/^nostr:\/?\/?/, "")

export const urlIsMedia = (url: string) =>
  Boolean(url.match(/\.(jpe?g|png|wav|mp3|mp4|mov|avi|webm|webp|gif|bmp|svg)$/))

// Copy some types from nostr-tools because I can't import them

export type AddressPointer = {
  identifier: string
  pubkey: string
  kind: number
  relays?: string[]
}

export type EventPointer = {
  id: string
  relays?: string[]
  author?: string
  kind?: number
}

export type ProfilePointer = {
  pubkey: string
  relays?: string[]
}

// Types

export type ParseContext = {
  results: Parsed[]
  content: string
  tags: string[][]
}

export enum ParsedType {
  Address = "address",
  Cashu = "cashu",
  Code = "code",
  Ellipsis = "ellipsis",
  Emoji = "emoji",
  Event = "event",
  Invoice = "invoice",
  Link = "link",
  LinkGrid = "link-grid",
  Newline = "newline",
  Profile = "profile",
  Text = "text",
  Topic = "topic",
}

export type ParsedBase = {
  raw: string
}

export type ParsedCashu = ParsedBase & {
  type: ParsedType.Cashu
  value: string
}

export type ParsedCode = ParsedBase & {
  type: ParsedType.Code
  value: string
}

export type ParsedEllipsis = ParsedBase & {
  type: ParsedType.Ellipsis
  value: string
}

export type ParsedEmojiValue = {
  name: string
  url?: string
}

export type ParsedEmoji = ParsedBase & {
  type: ParsedType.Emoji
  value: ParsedEmojiValue
}

export type ParsedInvoice = ParsedBase & {
  type: ParsedType.Invoice
  value: string
}

export type ParsedLinkValue = {
  url: URL
  meta: Record<string, string>
}

export type ParsedLinkGridValue = {
  links: ParsedLinkValue[]
}

export type ParsedLink = ParsedBase & {
  type: ParsedType.Link
  value: ParsedLinkValue
}

export type ParsedLinkGrid = ParsedBase & {
  type: ParsedType.LinkGrid
  value: ParsedLinkGridValue
}

export type ParsedNewline = ParsedBase & {
  type: ParsedType.Newline
  value: string
}

export type ParsedText = ParsedBase & {
  type: ParsedType.Text
  value: string
}

export type ParsedTopic = ParsedBase & {
  type: ParsedType.Topic
  value: string
}

export type ParsedEvent = ParsedBase & {
  type: ParsedType.Event
  value: EventPointer
}

export type ParsedProfile = ParsedBase & {
  type: ParsedType.Profile
  value: ProfilePointer
}

export type ParsedAddress = ParsedBase & {
  type: ParsedType.Address
  value: AddressPointer
}

export type Parsed =
  | ParsedAddress
  | ParsedCashu
  | ParsedCode
  | ParsedEllipsis
  | ParsedEmoji
  | ParsedEvent
  | ParsedInvoice
  | ParsedLink
  | ParsedLinkGrid
  | ParsedNewline
  | ParsedProfile
  | ParsedText
  | ParsedTopic

// Matchers

export const isAddress = (parsed: Parsed): parsed is ParsedAddress =>
  parsed.type === ParsedType.Address
export const isCashu = (parsed: Parsed): parsed is ParsedCashu => parsed.type === ParsedType.Cashu
export const isCode = (parsed: Parsed): parsed is ParsedCode => parsed.type === ParsedType.Code
export const isEllipsis = (parsed: Parsed): parsed is ParsedEllipsis =>
  parsed.type === ParsedType.Ellipsis
export const isEmoji = (parsed: Parsed): parsed is ParsedEmoji => parsed.type === ParsedType.Emoji
export const isEvent = (parsed: Parsed): parsed is ParsedEvent => parsed.type === ParsedType.Event
export const isInvoice = (parsed: Parsed): parsed is ParsedInvoice =>
  parsed.type === ParsedType.Invoice
export const isLink = (parsed: Parsed): parsed is ParsedLink => parsed.type === ParsedType.Link
export const isImage = (parsed: Parsed): parsed is ParsedLink =>
  isLink(parsed) && Boolean(parsed.value.url.toString().match(/\.(jpe?g|png|gif|webp)$/))
export const isLinkGrid = (parsed: Parsed): parsed is ParsedLinkGrid =>
  parsed.type === ParsedType.LinkGrid
export const isNewline = (parsed: Parsed): parsed is ParsedNewline =>
  parsed.type === ParsedType.Newline
export const isProfile = (parsed: Parsed): parsed is ParsedProfile =>
  parsed.type === ParsedType.Profile
export const isText = (parsed: Parsed): parsed is ParsedText => parsed.type === ParsedType.Text
export const isTopic = (parsed: Parsed): parsed is ParsedTopic => parsed.type === ParsedType.Topic

// Parsers for known formats

export const parseAddress = (text: string, context: ParseContext): ParsedAddress | void => {
  const [naddr] = text.match(/^(web\+)?(nostr:)naddr1[\d\w]+/i) || []

  if (naddr) {
    try {
      const {data} = decode(fromNostrURI(naddr))

      return {type: ParsedType.Address, value: data as AddressPointer, raw: naddr}
    } catch (e) {
      // Pass
    }
  }
}

export const parseCashu = (text: string, context: ParseContext): ParsedCashu | void => {
  const [value] = text.match(/^cashu:cashu[-\d\w=]{50,5000}/i) || []

  if (value) {
    return {type: ParsedType.Cashu, value, raw: value}
  }
}

export const parseCodeBlock = (text: string, context: ParseContext): ParsedCode | void => {
  const [raw, value] = text.match(/^```([^]*?)```/i) || []

  if (raw) {
    return {type: ParsedType.Code, value, raw}
  }
}

export const parseCodeInline = (text: string, context: ParseContext): ParsedCode | void => {
  const [raw, value] = text.match(/^`(.*?)`/i) || []

  if (raw) {
    return {type: ParsedType.Code, value, raw}
  }
}

export const parseEmoji = (text: string, context: ParseContext): ParsedEmoji | void => {
  const [raw, name] = text.match(/^:(\w+):/i) || []

  if (raw) {
    const url = context.tags.find(t => t[0] === "emoji" && t[1] === name)?.[2]

    return {type: ParsedType.Emoji, value: {name, url}, raw}
  }
}

export const parseEvent = (text: string, context: ParseContext): ParsedEvent | void => {
  const [entity] = text.match(/^(web\+)?(nostr:)n(event|ote)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = decode(fromNostrURI(entity))
      const value = type === "note" ? {id: data as string, relays: []} : (data as EventPointer)

      return {type: ParsedType.Event, value, raw: entity}
    } catch (e) {
      // Pass
    }
  }
}

export const parseInvoice = (text: string, context: ParseContext): ParsedInvoice | void => {
  const [raw, _, value] = text.match(/^(lightning:)(ln(bc|url)[0-9a-z]{10,})/i) || []

  if (raw && value) {
    return {type: ParsedType.Invoice, value, raw}
  }
}

export const parseLink = (text: string, context: ParseContext): ParsedLink | void => {
  const prev = last(context.results)
  const link = text.match(
    /^([a-z\+:]{2,30}:\/\/)?[-\.~\w]+\.[\w]{2,6}([^\s]*[^<>"'\.!,:\s\)\(]+)?/gi,
  )?.[0]

  // Skip url if it's just the end of a filepath or an ellipse
  if (!link || (prev?.type === ParsedType.Text && prev.value.endsWith("/")) || link.match(/\.\./)) {
    return
  }

  // Skip it if it looks like an IP address but doesn't have a protocol
  if (link.match(/\d+\.\d+/) && !link.includes("://")) {
    return
  }

  // Parse using URL, make sure there's a protocol
  let url
  try {
    url = new URL(link.match(/^\w+:\/\//) ? link : "https://" + link)
  } catch (e) {
    return
  }

  const meta = Object.fromEntries(new URLSearchParams(url.hash.slice(1)).entries())

  for (const tag of context.tags) {
    if (tag[0] === "imeta" && tag.find(t => t.includes(`url ${link}`))) {
      Object.assign(meta, Object.fromEntries(tag.slice(1).map((m: string) => m.split(" "))))
    }
  }

  return {type: ParsedType.Link, value: {url, meta}, raw: link}
}

export const parseNewline = (text: string, context: ParseContext): ParsedNewline | void => {
  const [value] = text.match(/^\n+/) || []

  if (value) {
    return {type: ParsedType.Newline, value, raw: value}
  }
}

export const parseProfile = (text: string, context: ParseContext): ParsedProfile | void => {
  const [entity] = text.match(/^@?(web\+)?(nostr:)n(profile|pub)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = decode(fromNostrURI(entity.replace("@", "")))
      const value =
        type === "npub" ? {pubkey: data as string, relays: []} : (data as ProfilePointer)

      return {type: ParsedType.Profile, value, raw: entity}
    } catch (e) {
      // Pass
    }
  }
}

export const parseTopic = (text: string, context: ParseContext): ParsedTopic | void => {
  const [value] = text.match(/^#[^\s!\"#$%&'()*+,-.\/:;<=>?@[\\\]^_`{|}~]+/i) || []

  // Skip numeric topics
  if (value && !value.match(/^#\d+$/)) {
    return {type: ParsedType.Topic, value: value.slice(1), raw: value}
  }
}

// Parse other formats to known types

export const parseLegacyMention = (
  text: string,
  context: ParseContext,
): ParsedProfile | ParsedEvent | void => {
  const mentionMatch = text.match(/^#\[(\d+)\]/i) || []

  if (mentionMatch) {
    const [tag, value, url] = context.tags[parseInt(mentionMatch[1])] || []
    const relays = url ? [url] : []

    if (tag === "p") {
      return {type: ParsedType.Profile, value: {pubkey: value, relays}, raw: mentionMatch[0]!}
    }

    if (tag === "e") {
      return {type: ParsedType.Event, value: {id: value, relays}, raw: mentionMatch[0]!}
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
  parseEmoji,
  parseEvent,
  parseCashu,
  parseInvoice,
  parseLink,
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
  minLength?: number
  maxLength?: number
  mediaLength?: number
  entityLength?: number
}

export const truncate = (
  content: Parsed[],
  {minLength = 500, maxLength = 700, mediaLength = 200, entityLength = 30}: TruncateOpts = {},
) => {
  // Get a list of content sizes so we know where to truncate
  // Non-plaintext things might take up more or less room if rendered
  const sizes = content.map((parsed: Parsed) => {
    switch (parsed.type) {
      case ParsedType.Link:
      case ParsedType.LinkGrid:
      case ParsedType.Cashu:
      case ParsedType.Invoice:
        return mediaLength
      case ParsedType.Event:
      case ParsedType.Address:
      case ParsedType.Profile:
        return entityLength
      case ParsedType.Emoji:
        return parsed.value.name.length
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

    if (currentSize > minLength) {
      content = content
        .slice(0, Math.max(1, i + 1))
        .concat({type: ParsedType.Ellipsis, value: "…", raw: ""})

      return false
    }

    return true
  })

  return content
}

export const reduceLinks = (content: Parsed[]): Parsed[] => {
  const result: Parsed[] = []
  const buffer: ParsedLinkValue[] = []

  for (const parsed of content) {
    const prev = last(result)

    // If we have a link and we're in our own block, start a grid
    if (isLink(parsed) && (!prev || isNewline(prev))) {
      buffer.push(parsed.value)
      continue
    }

    // Ignore newlines and empty space if we're building a grid
    if (isNewline(parsed) && buffer.length > 0) continue
    if (isText(parsed) && !parsed.value.trim() && buffer.length > 0) continue

    if (buffer.length > 0) {
      result.push({type: ParsedType.LinkGrid, value: {links: buffer.splice(0)}, raw: ""})
    }

    result.push(parsed)
  }

  if (buffer.length > 0) {
    result.push({type: ParsedType.LinkGrid, value: {links: buffer.splice(0)}, raw: ""})
  }

  return result
}
