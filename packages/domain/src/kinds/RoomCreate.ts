import {ROOM_CREATE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9007 create-room op.
export class RoomCreateReader extends EventReader {}

export class RoomCreateWriter extends EventWriter<RoomCreateReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomCreate requires a room")
    }
  }
}

export class RoomCreateQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomCreate = new KindFactory({
  kind: ROOM_CREATE,
  reader: RoomCreateReader,
  writer: RoomCreateWriter,
  query: RoomCreateQuery,
})
