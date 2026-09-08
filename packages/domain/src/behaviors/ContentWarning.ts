import {spec} from "@welshman/lib"
import {tagSpec, tagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

/**
 * A NIP-36 content warning, parsed from a `["content-warning", <reason>]` tag.
 * The reason is optional: a bare tag flags the content without saying why.
 */
export type ContentWarning = {
  reason?: string
}

/**
 * Parse an event's NIP-36 `content-warning` tag, or undefined if it has none.
 * A plain function so it can read the warning off any event, regardless of
 * kind, without a kind-specific reader.
 */
export const getContentWarning = (event: TrustedEvent): ContentWarning | undefined => {
  if (!event.tags.some(spec(["content-warning"]))) return undefined

  return {reason: tagValue(tagSpec("content-warning"), event.tags)}
}
