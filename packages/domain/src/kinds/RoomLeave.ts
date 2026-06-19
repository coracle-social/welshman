import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9022 room leave op, the counterpart to RoomJoin. A regular event
// carrying the target group id ("h") tag, which resets the membership state
// machine (ROOM_LEAVE -> Initial). The only represented tag is the group ("h"),
// which the base owns as a behavior tag, so buildTags is empty. Tags-only content.
export class RoomLeave extends EventReader {
  readonly kind = ROOM_LEAVE

  // The group id ("h") is read via the base group() accessor.
  h() {
    return this.group()
  }

  builder() {
    return new RoomLeaveBuilder(this)
  }
}

export class RoomLeaveBuilder extends EventBuilder<RoomLeave> {
  readonly kind = ROOM_LEAVE

  protected validate() {
    if (!this.groupTag) {
      throw new Error("RoomLeave requires an h identifier")
    }
  }
}
