import {uniq, spec} from "@welshman/lib"
import {ROOM_DELETE_EVENT, hexTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9005 delete-event op. The relay deletes the "e"-tagged events from the room named
// by the "h" tag, so unlike a kind 5 it is the moderator asking rather than the author.
export class RoomDeleteEventReader extends EventReader {
  ids() {
    return uniq(tagValues(hexTags("e"), this.event.tags))
  }
}

export class RoomDeleteEventWriter extends EventWriter<RoomDeleteEventReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomDeleteEvent requires a room")
    }
  }

  addId(id: string) {
    return this.dropTags(spec(["e", id])).addTags(["e", id])
  }

  setIds(ids: string[]) {
    return this.dropTags(spec(["e"])).addTags(...uniq(ids).map(id => ["e", id]))
  }
}

export class RoomDeleteEventQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomDeleteEvent = new KindFactory({
  kind: ROOM_DELETE_EVENT,
  reader: RoomDeleteEventReader,
  writer: RoomDeleteEventWriter,
  query: RoomDeleteEventQuery,
})
