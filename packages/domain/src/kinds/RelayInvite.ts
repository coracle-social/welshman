import {
  spec} from "@welshman/lib"
import {RELAY_INVITE,
  getTagValue,
} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-29 kind-28935 relay invite.
export class RelayInviteReader extends EventReader {
  readonly kind = RELAY_INVITE

  claim() {
    return getTagValue("claim", this.event.tags)
  }
}

export class RelayInviteWriter extends EventWriter<RelayInviteReader> {
  readonly kind = RELAY_INVITE
  readonly requiresRelays = true


  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }
}

export const RelayInvite = new KindFactory({
  reader: RelayInviteReader,
  writer: RelayInviteWriter,
})
