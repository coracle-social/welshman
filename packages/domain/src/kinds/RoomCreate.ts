import {ROOM_CREATE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9007 create-room action op. A regular (write-primarily) event
// carrying only the target group id ("h") tag. The "h" tag is a base behavior
// tag, so the reader exposes it via the inherited group() accessor and the
// builder sets it via the inherited group() setter — there are no kind-specific
// represented tags, so nothing else is needed here.
export class RoomCreate extends EventReader {
  readonly kind = ROOM_CREATE

  builder() {
    return new RoomCreateBuilder(this)
  }
}

export class RoomCreateBuilder extends EventBuilder<RoomCreate> {
  readonly kind = ROOM_CREATE
}
