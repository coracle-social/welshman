import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Ephemeral kind-28936 relay/space leave marker, the counterpart to RelayJoin.
// Carries no tags and no content; flotilla both emits it (the leave flow) and
// consumes it to reset the space membership state machine (RELAY_LEAVE ->
// Initial). Tags-only (in fact tag-free) content.
export class RelayLeave extends EventReader {
  readonly kind = RELAY_LEAVE

  builder() {
    return new RelayLeaveBuilder(this)
  }
}

export class RelayLeaveBuilder extends EventBuilder<RelayLeave> {
  readonly kind = RELAY_LEAVE
}
