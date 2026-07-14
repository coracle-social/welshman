import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Ephemeral kind-28936 relay/space leave marker.
export class RelayLeaveReader extends EventReader {}

export class RelayLeaveWriter extends EventWriter<RelayLeaveReader> {
  readonly requiresRelays = true
}

export const RelayLeave = new KindFactory({
  kind: RELAY_LEAVE,
  reader: RelayLeaveReader,
  writer: RelayLeaveWriter,
})
