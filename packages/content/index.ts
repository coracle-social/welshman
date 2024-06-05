import {nip19} from "nostr-tools"
import insane from 'insane'

const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

const fromNostrURI = (s: string) => s.replace(/^nostr:\/?\/?/, "")

export const urlIsMedia = (url: string) =>
  Boolean(url.match(/\.(jpe?g|png|wav|mp3|mp4|mov|avi|webm|webp|gif|bmp|svg)$/))

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
  Code = "code",
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

export type ParsedCode = {
  type: ParsedType.Code
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
  url: URL
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
  ParsedCode |
  ParsedEllipsis |
  ParsedEvent |
  ParsedInvoice |
  ParsedLink |
  ParsedNewline |
  ParsedProfile |
  ParsedText |
  ParsedTopic

// Matchers

export const isAddress  = (parsed: Parsed): parsed is ParsedAddress  => parsed.type === ParsedType.Address
export const isCashu    = (parsed: Parsed): parsed is ParsedCashu    => parsed.type === ParsedType.Cashu
export const isCode     = (parsed: Parsed): parsed is ParsedCode     => parsed.type === ParsedType.Code
export const isEllipsis = (parsed: Parsed): parsed is ParsedEllipsis => parsed.type === ParsedType.Ellipsis
export const isEvent    = (parsed: Parsed): parsed is ParsedEvent    => parsed.type === ParsedType.Event
export const isInvoice  = (parsed: Parsed): parsed is ParsedInvoice  => parsed.type === ParsedType.Invoice
export const isLink     = (parsed: Parsed): parsed is ParsedLink     => parsed.type === ParsedType.Link
export const isNewline  = (parsed: Parsed): parsed is ParsedNewline  => parsed.type === ParsedType.Newline
export const isProfile  = (parsed: Parsed): parsed is ParsedProfile  => parsed.type === ParsedType.Profile
export const isText     = (parsed: Parsed): parsed is ParsedText     => parsed.type === ParsedType.Text
export const isTopic    = (parsed: Parsed): parsed is ParsedTopic    => parsed.type === ParsedType.Topic

// Parsers for known formats

export const parseAddress = (text: string, context: ParseContext): ParsedAddress | void => {
  const [naddr] = text.match(/^(web\+)?(nostr:)?\/?\/?naddr1[\d\w]+/i) || []

  if (naddr) {
    try {
      const {data} = nip19.decode(fromNostrURI(naddr))

      return {type: ParsedType.Address, value: data as AddressPointer, raw: naddr}
    } catch (e) {
      // Pass
    }
  }
}

export const parseCashu = (text: string, context: ParseContext): ParsedCashu | void => {
  const [value] = text.match(/^(cashu)[\d\w=]{50,5000}/i) || []

  if (value) {
    return {type: ParsedType.Cashu, value, raw: value}
  }
}

export const parseCodeBlock = (text: string, context: ParseContext): ParsedCode | void => {
  const [code, value] = text.match(/^```([^]*?)```/i) || []

  if (code) {
    return {type: ParsedType.Code, value, raw: code}
  }
}

export const parseCodeInline = (text: string, context: ParseContext): ParsedCode | void => {
  const [code, value] = text.match(/^`(.*?)`/i) || []

  if (code) {
    return {type: ParsedType.Code, value, raw: code}
  }
}

export const parseEvent = (text: string, context: ParseContext): ParsedEvent | void => {
  const [entity] = text.match(/^(web\+)?(nostr:)?\/?\/?n(event|ote)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = nip19.decode(fromNostrURI(entity))
      const value = type === "note"
        ? {id: data as string, relays: []}
        : data as EventPointer

      return {type: ParsedType.Event, value, raw: entity}
    } catch (e) {
      // Pass
    }
  }
}

export const parseInvoice = (text: string, context: ParseContext): ParsedInvoice | void => {
  const [value] = text.match(/^ln(lnbc|lnurl)[\d\w]{50,1000}/i) || []

  if (value) {
    return {type: ParsedType.Invoice, value, raw: value}
  }
}

export const parseLink = (text: string, context: ParseContext): ParsedLink | void => {
  const prev = last(context.results)
  const [link] = text.match(/^([a-z\+:]{2,30}:\/\/)?[^<>\(\)\s]+\.[a-z]{2,6}[^\s]*[^<>"'\.!?,:\s\)\(]/gi) || []

  // Skip url if it's just the end of a filepath or an ellipse
  if (!link || prev?.type === ParsedType.Text && prev.value.endsWith("/") || link.match(/\.\./)) {
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
    if (tag[0] === 'imeta' && tag.find(t => t.includes(`url ${link}`))) {
      Object.assign(meta, Object.fromEntries(tag.slice(1).map((m: string) => m.split(" "))))
    }
  }

  return {type: ParsedType.Link, value: {url, meta, isMedia: urlIsMedia(url.pathname)}, raw: link}
}

export const parseNewline = (text: string, context: ParseContext): ParsedNewline | void => {
  const [value] = text.match(/^\n+/) || []

  if (value) {
    return {type: ParsedType.Newline, value, raw: value}
  }
}

export const parseProfile = (text: string, context: ParseContext): ParsedProfile | void => {
  const [entity] = text.match(/^@?(web\+)?(nostr:)?\/?\/?n(profile|pub)1[\d\w]+/i) || []

  if (entity) {
    try {
      const {type, data} = nip19.decode(fromNostrURI(entity.replace('@', '')))
      const value = type === "npub"
        ? {pubkey: data as string, relays: []}
        : data as ProfilePointer

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

export const parseLegacyMention = (text: string, context: ParseContext): ParsedProfile | ParsedEvent | void => {
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
  minLength?: number
  maxLength?: number
  mediaLength?: number
  entityLength?: number
}

export const truncate = (
  content: Parsed[],
  {
    minLength = 500,
    maxLength = 700,
    mediaLength = 200,
    entityLength = 30,
  }: TruncateOpts = {},
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
    if (currentSize > minLength) {
      content = content.slice(0, i).concat({type: ParsedType.Ellipsis, value: "…", raw: ""})

      return false
    }

    currentSize += size

    return true
  })

  return content
}

// Renderers

export type RenderOptions = {
  entityBaseUrl?: string
}

export const defaultRenderOptions = {
  entityBaseUrl: 'https://njump.me/'
}

export class HTML {
  constructor(readonly value: string) {
    this.value = value
  }

  toString = () => this.value

  static useSafely = (value: string) => new HTML(insane(value))

  static useDangerously = (value: string) => new HTML(value)

  static buildLink = (href: string, display: string) =>
    HTML.useSafely(`<a href=${href} target="_blank">${display}</a>`)

  static buildEntityLink = (entity: string, options: RenderOptions) =>
    HTML.buildLink(options.entityBaseUrl + entity, entity.slice(0, 16) + '…')
}

export const renderCashu = (parsed: ParsedCashu, options: RenderOptions) =>
  HTML.useSafely(parsed.value)

export const renderCode = (parsed: ParsedCode, options: RenderOptions) =>
  HTML.useSafely(parsed.value)

export const renderEllipsis = (parsed: ParsedEllipsis, options: RenderOptions) => "…"

export const renderInvoice = (parsed: ParsedInvoice, options: RenderOptions) =>
  HTML.useSafely(parsed.value)

export const renderLink = (parsed: ParsedLink, options: RenderOptions) => {
  const href = parsed.value.url.toString()
  const display = parsed.value.url.host + parsed.value.url.pathname

  return HTML.buildLink(href, display)
}

export const renderNewline = (parsed: ParsedNewline, options: RenderOptions) =>
  HTML.useSafely(Array.from(parsed.value).map(() => '<br />').join(''))

export const renderText = (parsed: ParsedText, options: RenderOptions) =>
  HTML.useSafely(parsed.value)

export const renderTopic = (parsed: ParsedTopic, options: RenderOptions) =>
  HTML.useSafely(parsed.value)

export const renderEvent = (parsed: ParsedEvent, options: RenderOptions) =>
  HTML.buildEntityLink(nip19.neventEncode(parsed.value), options)

export const renderProfile = (parsed: ParsedProfile, options: RenderOptions) =>
  HTML.buildEntityLink(nip19.nprofileEncode(parsed.value), options)

export const renderAddress = (parsed: ParsedAddress, options: RenderOptions) =>
  HTML.buildEntityLink(nip19.naddrEncode(parsed.value), options)

export const render = (parsed: Parsed, options: RenderOptions = {}) => {
  options = {...defaultRenderOptions, ...options}

  switch (parsed.type) {
    case ParsedType.Address:    return renderAddress(parsed as ParsedAddress, options)
    case ParsedType.Cashu:      return renderCashu(parsed as ParsedCashu, options)
    case ParsedType.Code:       return renderCode(parsed as ParsedCode, options)
    case ParsedType.Ellipsis:   return renderEllipsis(parsed as ParsedEllipsis, options)
    case ParsedType.Event:      return renderEvent(parsed as ParsedEvent, options)
    case ParsedType.Invoice:    return renderInvoice(parsed as ParsedInvoice, options)
    case ParsedType.Link:       return renderLink(parsed as ParsedLink, options)
    case ParsedType.Newline:    return renderNewline(parsed as ParsedNewline, options)
    case ParsedType.Profile:    return renderProfile(parsed as ParsedProfile, options)
    case ParsedType.Text:       return renderText(parsed as ParsedText, options)
    case ParsedType.Topic:      return renderTopic(parsed as ParsedTopic, options)
  }
}
