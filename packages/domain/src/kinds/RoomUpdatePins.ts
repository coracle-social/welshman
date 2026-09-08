import {nth, somePass, spec, uniq} from "@welshman/lib"
import {
  Address,
  ROOM_UPDATE_PINS,
  addressTags,
  hexTags,
  tagMatcher,
  tagValues,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9010 update-pins op. The relay replaces the room's kind-39005 list with what this
// carries, so it's always the full list rather than a delta.
export class RoomUpdatePinsReader extends EventReader {
  pins() {
    return uniq(
      this.event.tags
        .filter(somePass(tagMatcher(hexTags("e")), tagMatcher(addressTags("a"))))
        .map(nth(1)),
    )
  }

  ids() {
    return uniq(tagValues(hexTags("e"), this.event.tags))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.event.tags))
  }
}

export class RoomUpdatePinsWriter extends EventWriter<RoomUpdatePinsReader> {
  readonly requiresRelays = true

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomUpdatePins requires a room")
    }
  }

  setPins(idsOrAddresses: string[]) {
    return this.dropTags(somePass(spec(["e"]), spec(["a"]))).addTags(
      ...uniq(idsOrAddresses).map(value =>
        Address.isAddress(value) ? ["a", value] : ["e", value],
      ),
    )
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
