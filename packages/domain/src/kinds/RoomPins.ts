import {nth, somePass, spec, uniq} from "@welshman/lib"
import {Address, ROOM_PINS, addressTags, hexTags, tagMatcher, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-39005 room pin list (see https://github.com/nostr-protocol/nips/pull/2379).
export class RoomPinsReader extends EventReader {
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

  isPinned(idOrAddress: string) {
    return this.pins().includes(idOrAddress)
  }
}

export class RoomPinsWriter extends EventWriter<RoomPinsReader> {
  readonly requiresRelays = true

  setPins(idsOrAddresses: string[]) {
    return this.dropTags(somePass(spec(["e"]), spec(["a"]))).addTags(
      ...uniq(idsOrAddresses).map(value =>
        Address.isAddress(value) ? ["a", value] : ["e", value],
      ),
    )
  }
}

export class RoomPinsQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomPins = new KindFactory({
  kind: ROOM_PINS,
  reader: RoomPinsReader,
  writer: RoomPinsWriter,
  query: RoomPinsQuery,
})
