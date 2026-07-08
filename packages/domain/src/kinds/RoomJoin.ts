import {spec} from "@welshman/lib"
import {ROOM_JOIN, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-9021 room join request.
export class RoomJoinReader extends EventReader {
  readonly kind = ROOM_JOIN

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }
}

export class RoomJoinBuilder extends EventBuilder<RoomJoinReader> {
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

export const RoomJoin = new Kind({
  reader: RoomJoinReader,
  builder: RoomJoinBuilder,
  router: ContentRouter,
})
