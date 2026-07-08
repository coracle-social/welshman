import {ROOM_DELETE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-9008 delete-room op. The target room is the "h" group tag.
export class RoomDeleteReader extends EventReader {
  readonly kind = ROOM_DELETE
}

export class RoomDeleteBuilder extends EventBuilder<RoomDeleteReader> {
  readonly kind = ROOM_DELETE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomDelete requires an h group")
    }
  }
}

export const RoomDelete = new Kind({
  reader: RoomDeleteReader,
  builder: RoomDeleteBuilder,
  router: ContentRouter,
})
