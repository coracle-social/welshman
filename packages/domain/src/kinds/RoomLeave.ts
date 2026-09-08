import {ROOM_LEAVE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9022 room leave op. The target room is the "h" tag.
export class RoomLeaveReader extends EventReader {}

export class RoomLeaveWriter extends EventWriter<RoomLeaveReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomLeave requires a room")
    }
  }
}

export class RoomLeaveQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomLeave = new KindFactory({
  kind: ROOM_LEAVE,
  reader: RoomLeaveReader,
  writer: RoomLeaveWriter,
  query: RoomLeaveQuery,
})
