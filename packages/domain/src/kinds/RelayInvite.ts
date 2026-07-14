import {spec} from "@welshman/lib"
import {RELAY_INVITE, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-28935 relay invite.
export class RelayInviteReader extends EventReader {
  claim() {
    return getTagValue("claim", this.event.tags)
  }
}

export class RelayInviteWriter extends EventWriter<RelayInviteReader> {
  readonly requiresRelays = true

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }
}

export const RelayInvite = new KindFactory({
  kind: RELAY_INVITE,
  reader: RelayInviteReader,
  writer: RelayInviteWriter,
})
