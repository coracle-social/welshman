import {ROOM_CREATE} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-9007 create-room action op. A regular (write-primarily) event
// carrying only the target group id ("h") tag. The "h" tag is a base behavior
// tag, so the reader exposes it via the inherited group() accessor and the
// builder sets it via setGroup — there are no kind-specific represented tags.
export class RoomCreate extends EventReader {
  static kind = ROOM_CREATE

  builder() {
    return this.seedBuilder(new RoomCreateBuilder())
  }
}

export class RoomCreateBuilder extends EventBuilder {
  static kind = ROOM_CREATE

  protected buildTags() {
    return []
  }
}
