import {spec} from "@welshman/lib"
import {RELAY_INVITE, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-28935 relay invite.
export class RelayInviteReader extends EventReader {
  readonly kind = RELAY_INVITE

  claim() {
    return getTagValue("claim", this.event.tags)
  }
}

export class RelayInviteBuilder extends EventBuilder<RelayInviteReader> {
  readonly kind = RELAY_INVITE

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }
}

export const RelayInvite = new Kind({
  reader: RelayInviteReader,
  builder: RelayInviteBuilder,
  router: ContentRouter,
})
