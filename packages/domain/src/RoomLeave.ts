import {ROOM_LEAVE} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-9022 room leave op, the counterpart to RoomJoin. A regular event
// carrying the target group id ("h") tag, which resets the membership state
// machine (ROOM_LEAVE -> Initial). The only represented tag is the group ("h"),
// which the base owns as a behavior tag, so buildTags is empty. Tags-only content.
export class RoomLeave extends EventReader {
  static kind = ROOM_LEAVE

  protected validate() {
    if (!this.group()) {
      throw new Error("RoomLeave requires an h tag")
    }
  }

  // The group id ("h") is read via the base group() accessor.
  h() {
    return this.group()
  }

  builder() {
    const builder = new RoomLeaveBuilder()

    return this.seedBuilder(builder)
  }
}

export class RoomLeaveBuilder extends EventBuilder {
  static kind = ROOM_LEAVE

  protected validate() {
    if (!this.group) {
      throw new Error("RoomLeave requires an h identifier")
    }
  }

  protected buildTags() {
    return []
  }
}
