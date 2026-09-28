import {ROOM_UPDATE_PINS} from "@welshman/util"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import {RoomPinsReader, RoomPinsWriter} from "./RoomPins.js"

// NIP-29 kind-9010 update-pins op. The relay replaces the room's kind-39005 list with what this
// carries, so it's always the full list rather than a delta.
export class RoomUpdatePinsReader extends RoomPinsReader {}

export class RoomUpdatePinsWriter extends RoomPinsWriter<RoomUpdatePinsReader> {
  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomUpdatePins requires a room")
    }
  }
}

export class RoomUpdatePinsQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomUpdatePins = new KindFactory({
  kind: ROOM_UPDATE_PINS,
  reader: RoomUpdatePinsReader,
  writer: RoomUpdatePinsWriter,
  query: RoomUpdatePinsQuery,
})
