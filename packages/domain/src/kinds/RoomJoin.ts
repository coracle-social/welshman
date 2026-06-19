import {first} from "@welshman/lib"
import {ROOM_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9021 room join request. A regular (read-and-written) event
// carrying the target group id ("h", handled by the base group accessor), an
// optional invite "claim" tag (exposed as code), and a free-text reason in the
// event content. Drives the membership state machine (ROOM_JOIN ->
// Pending/Granted) and the pending-join admin queue, grouped by h + pubkey.
export class RoomJoin extends EventReader {
  readonly kind = ROOM_JOIN

  // The invite "claim" tag.
  code() {
    return getTagValue("claim", this.event.tags)
  }

  // Free-text reason carried in the event content.
  reason() {
    return this.event.content || undefined
  }

  builder() {
    return new RoomJoinBuilder(this)
  }
}

export class RoomJoinBuilder extends EventBuilder<RoomJoin> {
  readonly kind = ROOM_JOIN

  code?: string
  reason?: string

  constructor(readonly reader?: RoomJoin) {
    super(reader)

    // Consume the represented "claim" tag out of the carried-over extraTags so it
    // round-trips through the structured field below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const claim = first(this.consumeTags("claim"))

    this.code = claim?.[1]
    this.reason = reader?.event.content || undefined
  }

  setCode(code: string) {
    this.code = code

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected validate() {
    if (!this.groupTag) {
      throw new Error("RoomJoin requires an h/group")
    }
  }

  protected buildContent(_signer?: ISigner) {
    return this.reason || ""
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.code) tags.push(["claim", this.code])

    return tags
  }
}
