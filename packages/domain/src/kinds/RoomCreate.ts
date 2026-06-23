import {ROOM_CREATE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9007 create-room op.
export class RoomCreate extends EventReader {
  readonly kind = ROOM_CREATE

  builder() {
    return new RoomCreateBuilder(this)
  }
}

export class RoomCreateBuilder extends EventBuilder<RoomCreate> {
  readonly kind = ROOM_CREATE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomCreate requires a group")
    }
  }
}
