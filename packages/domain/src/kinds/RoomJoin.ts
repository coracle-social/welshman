import {spec} from "@welshman/lib"
import {ROOM_JOIN, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9021 room join request.
export class RoomJoinReader extends EventReader {
  claim() {
    return getTagValue("claim", this.event.tags)
  }
}

export class RoomJoinWriter extends EventWriter<RoomJoinReader> {
  readonly requiresRelays = true

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomJoin requires a group")
    }
  }
}

export const RoomJoin = new KindFactory({
  kind: ROOM_JOIN,
  reader: RoomJoinReader,
  writer: RoomJoinWriter,
})
