import {decode, neventEncode, nprofileEncode, naddrEncode} from "nostr-tools/nip19"
import {sanitizeUrl} from "@braintree/sanitize-url"

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
  content: string
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
  LinkGrid = "link-grid",
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
}

export type ParsedLinkGridValue = {
  links: ParsedLinkValue[]
}

export type ParsedLink = {
  type: ParsedType.Link
  value: ParsedLinkValue
  raw: string
}

export type ParsedLinkGrid = {
  type: ParsedType.LinkGrid
  value: ParsedLinkGridValue
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
  | ParsedAddress
  | ParsedCashu
  | ParsedCode
  | ParsedEllipsis
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
  const [naddr] = text.match(/^(web\+)?(nostr:)?\/?\/?naddr1[\d\w]+/i) || []

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
  const [value] = text.match(/^(cashu)[-\d\w=]{50,5000}/i) || []

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
      const {type, data} = decode(fromNostrURI(entity))
      const value = type === "note" ? {id: data as string, relays: []} : (data as EventPointer)

      return {type: ParsedType.Event, value, raw: entity}
    } catch (e) {
      // Pass
    }
  }
}

export const parseInvoice = (text: string, context: ParseContext): ParsedInvoice | void => {
  const [value] = text.match(/^ln(bc|url)[0-9a-z]{10,}/i) || []

  if (value) {
    return {type: ParsedType.Invoice, value, raw: value}
  }
}

export const parseLink = (text: string, context: ParseContext): ParsedLink | void => {
  const prev = last(context.results)
  const [link] =
    text.match(/^([a-z\+:]{2,30}:\/\/)?[-\.~\w]+\.[\w]{2,6}([^\s]*[^<>"'\.!,:\s\)\(]+)?/gi) || []

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
  const [entity] = text.match(/^@?(web\+)?(nostr:)?\/?\/?n(profile|pub)1[\d\w]+/i) || []

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

// Renderer

export class Renderer {
  private value = ""

  constructor(readonly options: RenderOptions) {}

  toString = () => this.value

  addText = (value: string) => {
    const element = document.createElement("div")

    element.innerText = value

    this.value += element.innerHTML
  }

  addNewlines = (count: number) => {
    for (let i = 0; i < count; i++) {
      this.value += this.options.newline
    }
  }

  addLink = (href: string, display: string) => {
    this.value += this.options.renderLink(href, display)
  }

  addEntityLink = (entity: string) => {
    this.addLink(this.options.entityBase + entity, this.options.renderEntity(entity))
  }
}

export type RenderOptions = {
  newline: string
  entityBase: string
  renderLink: (href: string, display: string) => string
  renderEntity: (entity: string) => string
}

export const textRenderOptions = {
  newline: "\n",
  entityBase: "",
  renderLink: (href: string, display: string) => href,
  renderEntity: (entity: string) => entity.slice(0, 16) + "…",
}

export const htmlRenderOptions = {
  newline: "\n",
  entityBase: "https://njump.me/",
  renderLink: (href: string, display: string) => {
    const element = document.createElement("a")

    element.href = sanitizeUrl(href)
    element.target = "_blank"
    element.innerText = display

    return element.outerHTML
  },
  renderEntity: (entity: string) => entity.slice(0, 16) + "…",
}

export const makeTextRenderer = (options: Partial<RenderOptions> = {}) =>
  new Renderer({...textRenderOptions, ...options})

export const makeHtmlRenderer = (options: Partial<RenderOptions> = {}) =>
  new Renderer({...htmlRenderOptions, ...options})

// Top level render methods

export const renderCashu = (p: ParsedCashu, r: Renderer) => r.addText(p.value)

export const renderCode = (p: ParsedCode, r: Renderer) => r.addText(p.value)

export const renderEllipsis = (p: ParsedEllipsis, r: Renderer) => r.addText("…")

export const renderInvoice = (p: ParsedInvoice, r: Renderer) => r.addText(p.value)

export const renderLink = (p: ParsedLink, r: Renderer) =>
  r.addLink(p.value.url.toString(), p.value.url.host + p.value.url.pathname)

export const renderNewline = (p: ParsedNewline, r: Renderer) =>
  r.addNewlines(Array.from(p.value).length)

export const renderText = (p: ParsedText, r: Renderer) => r.addText(p.value)

export const renderTopic = (p: ParsedTopic, r: Renderer) => r.addText(p.value)

export const renderEvent = (p: ParsedEvent, r: Renderer) => r.addEntityLink(neventEncode(p.value))

export const renderProfile = (p: ParsedProfile, r: Renderer) =>
  r.addEntityLink(nprofileEncode(p.value))

export const renderAddress = (p: ParsedAddress, r: Renderer) =>
  r.addEntityLink(naddrEncode(p.value))

export const renderOne = (parsed: Parsed, renderer: Renderer) => {
  switch (parsed.type) {
    case ParsedType.Address:
      renderAddress(parsed as ParsedAddress, renderer)
      break
    case ParsedType.Cashu:
      renderCashu(parsed as ParsedCashu, renderer)
      break
    case ParsedType.Code:
      renderCode(parsed as ParsedCode, renderer)
      break
    case ParsedType.Ellipsis:
      renderEllipsis(parsed as ParsedEllipsis, renderer)
      break
    case ParsedType.Event:
      renderEvent(parsed as ParsedEvent, renderer)
      break
    case ParsedType.Invoice:
      renderInvoice(parsed as ParsedInvoice, renderer)
      break
    case ParsedType.Link:
      renderLink(parsed as ParsedLink, renderer)
      break
    case ParsedType.Newline:
      renderNewline(parsed as ParsedNewline, renderer)
      break
    case ParsedType.Profile:
      renderProfile(parsed as ParsedProfile, renderer)
      break
    case ParsedType.Text:
      renderText(parsed as ParsedText, renderer)
      break
    case ParsedType.Topic:
      renderTopic(parsed as ParsedTopic, renderer)
      break
  }

  return renderer
}

export const renderMany = (parsed: Parsed[], renderer: Renderer) => {
  for (const p of parsed) {
    renderOne(p, renderer)
  }

  return renderer
}

export const render = (parsed: Parsed | Parsed[], renderer: Renderer) =>
  Array.isArray(parsed) ? renderMany(parsed, renderer) : renderOne(parsed, renderer)

export const renderAsText = (parsed: Parsed | Parsed[], options: Partial<RenderOptions> = {}) =>
  render(parsed, makeTextRenderer(options))

export const renderAsHtml = (parsed: Parsed | Parsed[], options: Partial<RenderOptions> = {}) =>
  render(parsed, makeHtmlRenderer(options))
