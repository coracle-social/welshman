import {spec} from "@welshman/lib"
import {ROOM_JOIN, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9021 room join request.
export class RoomJoin extends EventReader {
  readonly kind = ROOM_JOIN

  claim() {
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

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomJoin requires a group")
    }
  }
}
