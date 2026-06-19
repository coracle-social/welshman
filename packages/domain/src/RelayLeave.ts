import {RELAY_LEAVE} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// Ephemeral kind-28936 relay/space leave marker, the counterpart to RelayJoin.
// Carries no tags and no content; flotilla both emits it (the leave flow) and
// consumes it to reset the space membership state machine (RELAY_LEAVE ->
// Initial). Tags-only (in fact tag-free) content.
export class RelayLeave extends EventReader {
  static kind = RELAY_LEAVE

  builder() {
    return this.seedBuilder(new RelayLeaveBuilder())
  }
}

export class RelayLeaveBuilder extends EventBuilder {
  static kind = RELAY_LEAVE

  protected buildTags() {
    return [] as string[][]
  }
}
