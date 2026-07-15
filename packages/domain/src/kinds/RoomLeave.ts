import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9022 room leave op. The target room is the "h" group tag.
export class RoomLeaveReader extends EventReader {}

export class RoomLeaveWriter extends EventWriter<RoomLeaveReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomLeave requires a group")
    }
  }
}

export const RoomLeave = new KindFactory({
  kind: ROOM_LEAVE,
  reader: RoomLeaveReader,
  writer: RoomLeaveWriter,
})
