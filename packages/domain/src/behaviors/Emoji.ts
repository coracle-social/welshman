import type {TrustedEvent} from "@welshman/util"

/**
 * A NIP-30 custom emoji, parsed from an `["emoji", <shortcode>, <url>, <address>]`
 * tag. `address` is an optional `kind:pubkey:d-tag` pointer to the kind-30030
 * emoji set (NIP-51) the emoji belongs to.
 */
export type Emoji = {
  shortcode: string
  url: string
  address?: string
}

/**
 * Parse an event's NIP-30 `emoji` tags. Tags missing a shortcode or url are
 * skipped. A plain function so it can read emojis off any event, regardless of
 * kind, without a kind-specific reader.
 */
export const getEmojis = (event: TrustedEvent): Emoji[] =>
  event.tags
    .filter(tag => tag[0] === "emoji" && tag[1] && tag[2])
    .map(([, shortcode, url, address]) => ({shortcode, url, address}))
