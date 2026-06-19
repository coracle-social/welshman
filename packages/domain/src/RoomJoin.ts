import {ROOM_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-9021 room join request. A regular (read-and-written) event
// carrying the target group id ("h", handled by the base group accessor), an
// optional invite "claim" tag (exposed as code), and a free-text reason in the
// event content. Drives the membership state machine (ROOM_JOIN ->
// Pending/Granted) and the pending-join admin queue, grouped by h + pubkey.
export class RoomJoin extends EventReader {
  static kind = ROOM_JOIN

  protected validate() {
    if (!this.group()) {
      throw new Error("RoomJoin requires an h tag")
    }
  }

  protected reservedTagKeys() {
    return ["claim"]
  }

  // The invite "claim" tag.
  code() {
    return getTagValue("claim", this.event.tags)
  }

  // Free-text reason carried in the event content.
  reason() {
    return this.event.content || undefined
  }

  builder() {
    const builder = new RoomJoinBuilder()

    builder.code = this.code()
    builder.reason = this.reason()

    return this.seedBuilder(builder)
  }
}

export class RoomJoinBuilder extends EventBuilder {
  static kind = ROOM_JOIN

  code?: string
  reason?: string

  setCode(code: string) {
    this.code = code

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected validate() {
    if (!this.group) {
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
