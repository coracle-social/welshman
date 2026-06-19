import {ROOM_DELETE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9008 delete-room op. The target room is the "h" group tag.
export class RoomDelete extends EventReader {
  readonly kind = ROOM_DELETE

  builder() {
    return new RoomDeleteBuilder(this)
  }
}

export class RoomDeleteBuilder extends EventBuilder<RoomDelete> {
  readonly kind = ROOM_DELETE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomDelete requires an h group")
    }
  }
}
