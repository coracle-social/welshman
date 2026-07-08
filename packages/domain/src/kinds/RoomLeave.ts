import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-9022 room leave op. The target room is the "h" group tag.
export class RoomLeaveReader extends EventReader {
  readonly kind = ROOM_LEAVE
}

export class RoomLeaveBuilder extends EventBuilder<RoomLeaveReader> {
  readonly kind = ROOM_LEAVE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomLeave requires a group")
    }
  }
}

export const RoomLeave = new Kind({
  reader: RoomLeaveReader,
  builder: RoomLeaveBuilder,
  router: ContentRouter,
})
