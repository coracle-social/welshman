import {spec} from "@welshman/lib"
import {ROOM_JOIN, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9021 room join request.
export class RoomJoinReader extends EventReader {
  claim() {
    return tagValue(tagSpec("claim"), this.event.tags)
  }
}

export class RoomJoinWriter extends EventWriter<RoomJoinReader> {
  readonly requiresRelays = true

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomJoin requires a room")
    }
  }
}

export const RoomJoin = new KindFactory({
  kind: ROOM_JOIN,
  reader: RoomJoinReader,
  writer: RoomJoinWriter,
})
