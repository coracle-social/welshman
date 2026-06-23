import {spec} from "@welshman/lib"
import {RELAY_JOIN, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Ephemeral kind-28934 relay/space join request.
export class RelayJoin extends EventReader {
  readonly kind = RELAY_JOIN

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }

  builder() {
    return new RelayJoinBuilder(this)
  }
}

export class RelayJoinBuilder extends EventBuilder<RelayJoin> {
  readonly kind = RELAY_JOIN

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }
}
