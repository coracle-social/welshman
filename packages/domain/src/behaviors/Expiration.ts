import {toInt} from "@welshman/lib"
import {tagSpec, tagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

/**
 * Parse an event's NIP-40 `expiration` tag — the timestamp after which relays
 * should stop serving it — or undefined if it has none or the value isn't a
 * number. A plain function so it can read the expiration off any event,
 * regardless of kind, without a kind-specific reader.
 */
export const getExpiration = (event: TrustedEvent): number | undefined =>
  toInt(tagValue(tagSpec("expiration"), event.tags) ?? "")
