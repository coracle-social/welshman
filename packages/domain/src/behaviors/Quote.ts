import {isHex32, removeUndefined} from "@welshman/lib"
import {Address} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

/**
 * An event quoted by another, parsed from a NIP-18 `q` tag of the form
 * `["q", <event id or address>, <relay hint>, <pubkey>]`. `value` is whichever of
 * the two the tag names — an address for a replaceable event, an id for anything
 * else, matching `getIdOrAddress`. The hint and the quoted event's author are
 * optional either way.
 */
export type Quote = {
  value: string
  relay?: string
  pubkey?: string
}

/**
 * Parse a single `q` tag, or undefined for any other tag and for a `q` tag whose
 * value is neither an event id nor an address. A pubkey that isn't one is dropped
 * rather than passed on as an author.
 */
export const parseQuote = (tag: string[]): Quote | undefined => {
  const [key, value = "", relay, pubkey = ""] = tag

  let quote: Quote | undefined

  if (key === "q" && (isHex32(value) || Address.isAddress(value))) {
    quote = {
      value,
      relay: relay || undefined,
      pubkey: isHex32(pubkey) ? pubkey : undefined,
    }
  }

  return quote
}

export const parseQuotes = (tags: string[][]): Quote[] => removeUndefined(tags.map(parseQuote))

/**
 * Parse an event's NIP-18 `q` tags, in the order they appear — kinds that treat
 * one of them specially (a NIP-C7 reply quotes the message it answers) pick it out
 * of the list. A plain function so it can read quotes off any event, regardless of
 * kind, without a kind-specific reader.
 */
export const getQuotes = (event: TrustedEvent): Quote[] => parseQuotes(event.tags)

/**
 * Render a quote as a `q` tag, dropping the trailing elements it doesn't carry.
 * A pubkey with no hint keeps the hint slot empty, since both are positional.
 */
export const renderQuote = ({value, relay, pubkey}: Quote): string[] => {
  const tag = ["q", value]

  if (pubkey) {
    tag.push(relay || "", pubkey)
  } else if (relay) {
    tag.push(relay)
  }

  return tag
}
