import {first} from "@welshman/lib"
import {ROOM_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9021 room join request.
export class RoomJoin extends EventReader {
  readonly kind = ROOM_JOIN

  code() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }

  builder() {
    return new RoomJoinBuilder(this)
  }
}

export class RoomJoinBuilder extends EventBuilder<RoomJoin> {
  readonly kind = ROOM_JOIN

  codeTag?: string[]
  reason?: string

  constructor(readonly reader?: RoomJoin) {
    super(reader)

    this.codeTag = first(this.consumeTags("claim"))
    this.reason = reader?.event.content || undefined
  }

  setCode(code: string) {
    this.codeTag = ["claim", code]

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomJoin requires an h/group")
    }
  }

  protected buildContent(_signer?: ISigner) {
    return this.reason || ""
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.codeTag) tags.push(this.codeTag)

    return tags
  }
}
