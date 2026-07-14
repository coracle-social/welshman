import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Ephemeral kind-28936 relay/space leave marker.
export class RelayLeaveReader extends EventReader {
  readonly kind = RELAY_LEAVE
}

export class RelayLeaveWriter extends EventWriter<RelayLeaveReader> {
  readonly kind = RELAY_LEAVE
  readonly requiresRelays = true
}

export const RelayLeave = new KindFactory({
  reader: RelayLeaveReader,
  writer: RelayLeaveWriter,
})
