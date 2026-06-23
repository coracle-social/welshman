import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9022 room leave op. The target room is the "h" group tag.
export class RoomLeave extends EventReader {
  readonly kind = ROOM_LEAVE

  builder() {
    return new RoomLeaveBuilder(this)
  }
}

export class RoomLeaveBuilder extends EventBuilder<RoomLeave> {
  readonly kind = ROOM_LEAVE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomLeave requires a group")
    }
  }
}
