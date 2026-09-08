import {spec} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"

/**
 * Whether an event carries the NIP-70 `["-"]` marker, which asks relays to
 * accept it only from its author. A plain function so it can read the marker
 * off any event, regardless of kind, without a kind-specific reader.
 */
export const isProtected = (event: TrustedEvent): boolean => event.tags.some(spec(["-"]))
