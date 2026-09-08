import {ROOM_DELETE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9008 delete-room op. The target room is the "h" tag.
export class RoomDeleteReader extends EventReader {}

export class RoomDeleteWriter extends EventWriter<RoomDeleteReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomDelete requires a room")
    }
  }
}

export class RoomDeleteQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomDelete = new KindFactory({
  kind: ROOM_DELETE,
  reader: RoomDeleteReader,
  writer: RoomDeleteWriter,
  query: RoomDeleteQuery,
})
