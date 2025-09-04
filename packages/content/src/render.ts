import {neventEncode, nprofileEncode, naddrEncode} from "nostr-tools/nip19"
import {sanitizeUrl} from "@braintree/sanitize-url"
import {
  Parsed,
  ParsedType,
  ParsedTopic,
  ParsedProfile,
  ParsedNewline,
  ParsedLink,
  ParsedInvoice,
  ParsedEvent,
  ParsedEmoji,
  ParsedEllipsis,
  ParsedCode,
  ParsedCashu,
  ParsedAddress,
  ParsedText,
} from "./parser.js"

export class Renderer {
  private value = ""

  constructor(readonly options: RenderOptions) {}

  toString = () => this.value

  addText = (value: string) => {
    const element = this.options.createElement("div")

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
  createElement: (tag: string) => any
}

export const textRenderOptions = {
  newline: "\n",
  entityBase: "",
  createElement: (tag: string) => document.createElement(tag) as any,
  renderLink: (href: string, display: string) => href,
  renderEntity: (entity: string) => entity.slice(0, 16) + "…",
}

export const htmlRenderOptions = {
  newline: "\n",
  entityBase: "https://njump.me/",
  createElement: (tag: string) => document.createElement(tag) as any,
  renderLink(href: string, display: string) {
    const element = this.createElement("a")

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

export const renderEmoji = (p: ParsedEmoji, r: Renderer) => r.addText(p.raw)

export const renderInvoice = (p: ParsedInvoice, r: Renderer) =>
  r.addLink("lightning:" + p.value, p.value.slice(0, 16) + "…")

export const renderLink = (p: ParsedLink, r: Renderer) =>
  r.addLink(p.value.url.toString(), p.value.url.host + p.value.url.pathname.replace(/^\/$/, ""))

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
    case ParsedType.Emoji:
      renderEmoji(parsed as ParsedEmoji, renderer)
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
