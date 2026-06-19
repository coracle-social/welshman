import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Ephemeral kind-28936 relay/space leave marker.
export class RelayLeave extends EventReader {
  readonly kind = RELAY_LEAVE

  builder() {
    return new RelayLeaveBuilder(this)
  }
}

export class RelayLeaveBuilder extends EventBuilder<RelayLeave> {
  readonly kind = RELAY_LEAVE
}
