import {spec} from "@welshman/lib"
import {RELAY_JOIN, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// Ephemeral kind-28934 relay/space join request.
export class RelayJoinReader extends EventReader {
  readonly kind = RELAY_JOIN

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }
}

export class RelayJoinBuilder extends EventBuilder<RelayJoinReader> {
  readonly kind = RELAY_JOIN

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }
}

export const RelayJoin = new Kind({
  reader: RelayJoinReader,
  builder: RelayJoinBuilder,
  router: ContentRouter,
})
