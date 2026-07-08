import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// Ephemeral kind-28936 relay/space leave marker.
export class RelayLeaveReader extends EventReader {
  readonly kind = RELAY_LEAVE
}

export class RelayLeaveBuilder extends EventBuilder<RelayLeaveReader> {
  readonly kind = RELAY_LEAVE
}

export const RelayLeave = new Kind({
  reader: RelayLeaveReader,
  builder: RelayLeaveBuilder,
  router: ContentRouter,
})
