import {ROOM_DELETE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9008 delete-room op. The target room is the "h" group tag.
export class RoomDeleteReader extends EventReader {
  readonly kind = ROOM_DELETE
}

export class RoomDeleteWriter extends EventWriter<RoomDeleteReader> {
  readonly kind = ROOM_DELETE
  readonly requiresRelays = true


  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomDelete requires an h group")
    }
  }
}

export const RoomDelete = new KindFactory({
  reader: RoomDeleteReader,
  writer: RoomDeleteWriter,
})
