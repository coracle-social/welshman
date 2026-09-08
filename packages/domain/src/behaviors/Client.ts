import {Address, isRelayUrl, matchTag, normalizeRelayUrl, tagSpec} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

/**
 * The NIP-89 client an event was published with, parsed from a
 * `["client", <name>, <address>, <relay hint>]` tag. `address` is an optional
 * `31990:pubkey:d-tag` pointer to the client's handler information event, and
 * `relay` an optional hint for where to find it.
 */
export type Client = {
  name: string
  address?: string
  relay?: string
}

/**
 * Parse an event's NIP-89 `client` tag, or undefined if it has none. An address
 * or relay hint that doesn't parse is dropped. A plain function so it can read
 * the client off any event, regardless of kind, without a kind-specific reader.
 */
export const getClient = (event: TrustedEvent): Client | undefined => {
  const tag = matchTag(tagSpec("client"), event.tags)

  if (!tag?.[1]) return undefined

  const [, name, address, relay] = tag

  return {
    name,
    address: address && Address.isAddress(address) ? address : undefined,
    relay: relay && isRelayUrl(relay) ? normalizeRelayUrl(relay) : undefined,
  }
}
