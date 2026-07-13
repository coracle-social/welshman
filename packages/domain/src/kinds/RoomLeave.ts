import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-29 kind-9022 room leave op. The target room is the "h" group tag.
export class RoomLeaveReader extends EventReader {
  readonly kind = ROOM_LEAVE
}

export class RoomLeaveWriter extends EventWriter<RoomLeaveReader> {
  readonly kind = ROOM_LEAVE
  readonly requiresRelays = true


  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomLeave requires a group")
    }
  }
}

export const RoomLeave = new KindFactory({
  reader: RoomLeaveReader,
  writer: RoomLeaveWriter,
})
