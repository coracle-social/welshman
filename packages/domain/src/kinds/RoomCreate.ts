import {ROOM_CREATE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-9007 create-room op.
export class RoomCreateReader extends EventReader {
  readonly kind = ROOM_CREATE
}

export class RoomCreateBuilder extends EventBuilder<RoomCreateReader> {
  readonly kind = ROOM_CREATE

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomCreate requires a group")
    }
  }
}

export const RoomCreate = new Kind({
  reader: RoomCreateReader,
  builder: RoomCreateBuilder,
  router: ContentRouter,
})
