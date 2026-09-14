import {spec, uniq} from "@welshman/lib"
import {Address, MESSAGE, getIdOrAddress, isRelayUrl, toNostrURI} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {decodeNostrURI, neventEncode} from "nostr-tools/nip19"
import {renderQuote} from "../behaviors/Quote.js"
import type {Quote} from "../behaviors/Quote.js"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// The same shape @welshman/content's `parseEvent` renders as a quote, anchored to
// the start of the content and ending at whitespace or the end of the message.
const LEADING_QUOTE = /^(?:web\+)?(?:nostr:)?(n(?:event|ote|addr)1[a-z0-9]+)(?=\s|$)/i

/**
 * Reads the message a NIP-C7 reply answers, which it quotes with a bech32
 * reference on the content's first line. The `nostr:` prefix is optional, since
 * clients write the entity both ways. Returns undefined when the content doesn't
 * open with a line that decodes to an event.
 */
export const getContentQuote = (content: string): Quote | undefined => {
  const entity = content.match(LEADING_QUOTE)?.[1]

  let quote: Quote | undefined

  if (entity) {
    const {type, data} = decodeNostrURI(entity)

    if (type === "note") {
      quote = {value: data}
    }

    if (type === "nevent") {
      quote = {value: data.id, relay: data.relays?.find(isRelayUrl), pubkey: data.author}
    }

    if (type === "naddr") {
      const {kind, pubkey, identifier, relays} = data

      quote = {
        value: new Address(kind, pubkey, identifier).toString(),
        relay: relays?.find(isRelayUrl),
        pubkey,
      }
    }
  }

  return quote
}

// NIP-C7 kind-9 chat message.
export class MessageReader extends EventReader {
  // The quote treated as a reply by this nip
  parent() {
    const quote = getContentQuote(this.content())

    return quote && (this.quotes().find(spec({value: quote.value})) ?? quote)
  }
}

export class MessageWriter extends EventWriter<MessageReader> {
  // Chat lives on the relay hosting it, so the caller pins one with `setRoom` (a
  // NIP-29 room) or `forceRoutes`.
  readonly requiresRelays = true

  // The message this one replies to. It owns both the reference the content opens
  // with and the matching `q` tag.
  parentQuote?: Quote

  constructor(kind: number, context: KindContext, reader?: MessageReader) {
    super(kind, context, reader)

    this.parentQuote = reader?.parent()

    // The reference renders from the parent, so `content` keeps the body alone.
    if (this.parentQuote) {
      this.content = this.content.replace(LEADING_QUOTE, "").trimStart()
    }
  }

  /**
   * Replies to `event`: the rendered content opens with a `nostr:` reference to
   * it, the `q` tag names its id and author, and `addMention` p-tags that author
   * so the reply reaches them — a reference alone carries neither the author nor
   * the mention. Both render from the quote, so call order doesn't matter.
   */
  setParent(event: TrustedEvent) {
    this.clearParent()
    this.addMention(event.pubkey)
    this.parentQuote = {value: getIdOrAddress(event), pubkey: event.pubkey}

    return this
  }

  clearParent() {
    const {parentQuote} = this

    if (parentQuote) {
      if (parentQuote.pubkey) {
        this.dropTags(spec(["p", parentQuote.pubkey]))
      }

      this.removeQuote(parentQuote.value)
    }

    this.parentQuote = undefined

    return this
  }

  // No relay hint: a reply and the message it answers are both on the relay
  // hosting the chat.
  protected renderDomainTags() {
    const {parentQuote} = this
    const tags: string[][] = []

    // The parent may be tagged already — quoted mid-content before it was promoted
    // to the first line, or added with `addQuote` — so tag it only if nothing has.
    if (parentQuote && !this.extraTags.some(spec(["q", parentQuote.value]))) {
      tags.push(renderQuote({...parentQuote, relay: undefined}))
    }

    return tags
  }

  renderContent() {
    const {parentQuote} = this
    let content = this.content
    let entity: string | undefined

    if (parentQuote) {
      entity = Address.isAddress(parentQuote.value)
        ? Address.from(parentQuote.value).toNaddr()
        : neventEncode({id: parentQuote.value, author: parentQuote.pubkey})
    }

    if (entity) {
      content = `${toNostrURI(entity)}\n\n${content}`
    }

    return content
  }
}

export class MessageQuery extends EventQuery {
  // Replies to `event`. A replaceable event is quoted by the address that follows
  // its updates, but another client may have quoted the id, so ask for both.
  forParent(event: TrustedEvent) {
    return this.addTag("q", uniq([event.id, getIdOrAddress(event)]))
  }

  // A chat view comes from the relay hosting it, which the caller pins with
  // `setRoom` or `setRoutes`.
  protected renderRoutes() {
    return []
  }
}

export const Message = new KindFactory({
  kind: MESSAGE,
  reader: MessageReader,
  writer: MessageWriter,
  query: MessageQuery,
})
